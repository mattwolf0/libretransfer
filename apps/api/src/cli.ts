import { pathToFileURL } from 'node:url'

import { loadSettings, type Settings } from './config.js'
import { AppDatabase } from './database.js'
import { hashPassword } from './passwords.js'
import { changeUserPassword, cleanUsername, createUser, listUsers, renameUser } from './users.js'

type Command = (settings: Settings, args: string[]) => Promise<void>

async function askPassword(label = 'Password') {
  const { password } = await import('@inquirer/prompts')
  const first = await password({ message: `${label} (at least 10 characters):`, mask: '*' })
  const second = await password({ message: 'Repeat password:', mask: '*' })
  if (first !== second) throw new Error('Passwords do not match.')
  return hashPassword(first)
}

async function askText(message: string, defaultValue?: string) {
  const { input } = await import('@inquirer/prompts')
  return defaultValue ? input({ message, default: defaultValue }) : input({ message })
}

async function useDatabase<T>(settings: Settings, work: (db: AppDatabase) => Promise<T> | T) {
  const db = new AppDatabase(settings.databasePath)
  try {
    db.migrate()
    return await work(db)
  } finally {
    db.close()
  }
}

function readValues(args: string[], allowedOptions: string[] = []) {
  const unknownOption = args.find((arg) => arg.startsWith('--') && !allowedOptions.includes(arg))
  if (unknownOption) throw new Error(`Unknown option: ${unknownOption}`)
  return args.filter((arg) => !arg.startsWith('--'))
}

async function setupApp(settings: Settings, args: string[]) {
  if (readValues(args).length) throw new Error('Usage: pnpm cli app setup')

  await useDatabase(settings, async (db) => {
    const admin = db.get<{ username: string }>(
      "SELECT username FROM users WHERE role = 'admin' LIMIT 1",
    )
    if (admin) {
      console.log(`Setup is already complete. Admin: ${admin.username}`)
      return
    }

    const { seedAdmin } = await import('./auth.js')
    if (await seedAdmin(db, settings)) {
      console.log(`Created the first admin user: ${settings.adminUser}`)
      return
    }

    const username = cleanUsername(await askText('Admin username:', settings.adminUser))
    const passwordHash = await askPassword()
    createUser(db, username, passwordHash, 'admin')
    console.log(`Created the first admin user: ${username}`)
  })
}

async function addUser(settings: Settings, args: string[]) {
  const values = readValues(args, ['--admin'])
  if (values.length > 1) throw new Error('Usage: pnpm cli user add [username] [--admin]')

  const username = cleanUsername(values[0] ?? (await askText('Username:')))
  const role = args.includes('--admin') ? 'admin' : 'member'
  await useDatabase(settings, async (db) => {
    if (db.get('SELECT id FROM users WHERE username = ?', username)) {
      throw new Error('A user with this name already exists.')
    }
    const passwordHash = await askPassword()
    createUser(db, username, passwordHash, role)
  })
  console.log(`Created ${role} user: ${username}`)
}

async function showUsers(settings: Settings, args: string[]) {
  if (readValues(args).length) throw new Error('Usage: pnpm cli user list')

  const users = await useDatabase(settings, (db) => listUsers(db))
  if (!users.length) {
    console.log('No users found.')
    return
  }
  console.log('Users:')
  for (const user of users) {
    const status = user.active ? 'active' : 'disabled'
    console.log(`- ${user.username} (${user.role}, ${status})`)
  }
}

async function renameExistingUser(settings: Settings, args: string[]) {
  const values = readValues(args)
  if (values.length > 2) {
    throw new Error('Usage: pnpm cli user rename [current-name] [new-name]')
  }

  const currentUsername = cleanUsername(values[0] ?? (await askText('Current username:')))
  const nextUsername = cleanUsername(values[1] ?? (await askText('New username:')))
  await useDatabase(settings, (db) => renameUser(db, currentUsername, nextUsername))
  console.log(`Renamed user: ${currentUsername} -> ${nextUsername}`)
}

async function setPassword(settings: Settings, args: string[]) {
  const values = readValues(args)
  if (values.length > 1) throw new Error('Usage: pnpm cli user password [username]')

  const username = cleanUsername(values[0] ?? (await askText('Username:')))
  await useDatabase(settings, async (db) => {
    if (!db.get('SELECT id FROM users WHERE username = ?', username)) {
      throw new Error('User was not found.')
    }
    const passwordHash = await askPassword('New password')
    changeUserPassword(db, username, passwordHash)
  })
  console.log(`Changed password for: ${username}`)
}

function showHelp() {
  console.log(`LibreTransfer CLI

Usage:
  pnpm cli <group> <command>

Groups:
  app                         Set up or start LibreTransfer
  user                        Manage users

Help:
  pnpm cli help               Show this help
  pnpm cli help app           Show app commands
  pnpm cli help user          Show user commands`)
}

function showAppHelp() {
  console.log(`App commands:
  pnpm cli app setup          Create the first admin user
  pnpm cli app start          Start LibreTransfer`)
}

function showUserHelp() {
  console.log(`User commands:
  pnpm cli user add [name] [--admin]   Create a member or admin user
  pnpm cli user list                   List users
  pnpm cli user rename [old] [new]     Change a username
  pnpm cli user password [name]        Change a password

Passwords are entered in a hidden prompt.`)
}

function showHelpTopic(topic: string | undefined) {
  if (!topic) showHelp()
  else if (topic === 'app') showAppHelp()
  else if (topic === 'user') showUserHelp()
  else throw new Error(`Unknown help topic: ${topic}. Run pnpm cli help.`)
}

const userCommands: Record<string, Command> = {
  add: addUser,
  list: showUsers,
  rename: renameExistingUser,
  password: setPassword,
}

async function runUserCommand(settings: Settings, args: string[]) {
  const [command = 'help', ...values] = args
  if (command === 'help' || command === '--help' || command === '-h') {
    showUserHelp()
    return
  }
  const handler = userCommands[command]
  if (!handler) throw new Error(`Unknown user command: ${command}. Run pnpm cli help user.`)
  await handler(settings, values)
}

async function startApp(settings: Settings, args: string[]) {
  if (readValues(args).length) throw new Error('Usage: pnpm cli app start')

  const { buildApp } = await import('./app.js')
  const app = await buildApp()
  try {
    const address = await app.listen({ host: settings.host, port: settings.port })
    console.log(`LibreTransfer is ready at ${address}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      console.error(`Port ${settings.port} is already in use.`)
    } else {
      console.error(error)
    }
    await app.close()
    return
  }
}

const appCommands: Record<string, Command> = {
  setup: setupApp,
  start: startApp,
}

async function runAppCommand(settings: Settings, args: string[]) {
  const [command = 'help', ...values] = args
  if (command === 'help' || command === '--help' || command === '-h') {
    showAppHelp()
    return
  }
  const handler = appCommands[command]
  if (!handler) throw new Error(`Unknown app command: ${command}. Run pnpm cli help app.`)
  await handler(settings, values)
}

const commands: Record<string, Command> = {
  app: runAppCommand,
  user: runUserCommand,
  serve: startApp,
  setup: setupApp,
  'create-user': addUser,
  'change-password': setPassword,
}

export async function main(args = process.argv.slice(2)) {
  const [command = 'help', ...values] = args
  if (command === 'help' || command === '--help' || command === '-h') {
    if (values.length > 1) throw new Error('Usage: pnpm cli help [app|user]')
    showHelpTopic(values[0])
    return 0
  }
  if (command === 'app' && ['help', '--help', '-h'].includes(values[0] ?? 'help')) {
    showAppHelp()
    return 0
  }
  if (command === 'user' && ['help', '--help', '-h'].includes(values[0] ?? 'help')) {
    showUserHelp()
    return 0
  }

  const handler = commands[command]
  if (!handler) throw new Error(`Unknown command: ${command}. Run pnpm cli help.`)
  await handler(loadSettings(), values)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error)
      process.exitCode = 1
    })
}
