import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

const en = {
  appName: 'LibreTransfer',
  appNote: 'Your files, on your server.',
  loginText: 'Sign in to open your shared files.',
  username: 'Username',
  password: 'Password',
  signIn: 'Sign in',
  signingIn: 'Signing in...',
  signOut: 'Sign out',
  storages: 'Storages',
  files: 'Files',
  root: 'Root',
  newFolder: 'New folder',
  folderName: 'Folder name',
  folder: 'Folder',
  file: 'File',
  type: 'Type',
  create: 'Create',
  cancel: 'Cancel',
  rename: 'Rename',
  delete: 'Delete',
  download: 'Download',
  copyLink: 'Copy link',
  copyLinks: 'Copy links',
  upload: 'Upload files',
  chooseFiles: 'Choose files',
  uploadDrop: 'Drop files here or choose them from your device.',
  uploadRunning: 'Uploading {name} · {progress}%',
  uploadPreparing: 'Preparing the upload...',
  uploading: 'Uploading...',
  uploadPaused: 'The upload is paused.',
  uploadCompleted: 'The upload is complete.',
  uploadCancelled: 'The upload was cancelled.',
  pause: 'Pause',
  continue: 'Continue',
  cancelUpload: 'Cancel upload',
  cancelAll: 'Cancel all',
  queuedFiles: '{count} more file(s) in the queue.',
  uploadsToContinue: 'Uploads that can continue',
  emptyFolder: 'This folder is empty.',
  emptyNote: 'Upload a file or create a folder to get started.',
  noSearchResults: 'No matching files.',
  noSearchNote: 'Try a different file name or clear the search.',
  noStorage: 'No storage is available.',
  noStorageNote: 'An admin needs to add or fix a storage folder.',
  notAvailable: 'Not available',
  readOnly: 'Read only',
  writable: 'Upload allowed',
  name: 'Name',
  size: 'Size',
  changed: 'Changed',
  actions: 'Actions',
  loading: 'Loading files...',
  searchFiles: 'Search by file name',
  clearSearch: 'Clear search',
  selectPage: 'Select this page',
  selectItem: 'Select {name}',
  selectedCount: '{count} selected',
  clearSelection: 'Clear selection',
  moveToTrash: 'Move to trash',
  confirmDelete: 'Move “{name}” to the trash?',
  confirmBulkDelete: 'Move {count} selected item(s) to the trash?',
  deleteNote: 'An admin can restore it from the API.',
  folderMade: 'Folder created.',
  renamed: 'Item renamed.',
  movedToTrash: 'Item moved to trash.',
  bulkTrashResult: '{moved} moved, {failed} failed. Failed items: {names}',
  linkCopied: 'Link copied. The user must be signed in to open it.',
  linksCopied: 'Links copied. The users must be signed in to open them.',
  copyFailed: 'The link could not be copied. Check browser permission.',
  noFileLinks: 'The selection does not contain a downloadable file.',
  theme: 'Theme',
  language: 'Language',
  light: 'Light',
  dark: 'Dark',
  system: 'System',
  close: 'Close',
  retry: 'Try again',
  breadcrumb: 'Current folder',
  pagination: 'File pages',
  itemCount: '{count} item(s)',
  perPage: 'Per page',
  previous: 'Previous',
  next: 'Next',
  pageCount: 'Page {page} of {total}',
  changeFailed: 'The change failed.',
  uploadFailed: 'The upload failed.',
  loginFailed: 'Login failed.',
} as const

const hu: Record<keyof typeof en, string> = {
  appName: 'LibreTransfer',
  appNote: 'A fájljaid, a saját szervereden.',
  loginText: 'Jelentkezz be a megosztott fájlok megnyitásához.',
  username: 'Felhasználónév',
  password: 'Jelszó',
  signIn: 'Belépés',
  signingIn: 'Belépés...',
  signOut: 'Kilépés',
  storages: 'Tárhelyek',
  files: 'Fájlok',
  root: 'Gyökér',
  newFolder: 'Új mappa',
  folderName: 'Mappa neve',
  folder: 'Mappa',
  file: 'Fájl',
  type: 'Típus',
  create: 'Létrehozás',
  cancel: 'Mégse',
  rename: 'Átnevezés',
  delete: 'Törlés',
  download: 'Letöltés',
  copyLink: 'Link másolása',
  copyLinks: 'Linkek másolása',
  upload: 'Fájlok feltöltése',
  chooseFiles: 'Fájlok kiválasztása',
  uploadDrop: 'Húzd ide a fájlokat, vagy válaszd ki őket az eszközödről.',
  uploadRunning: '{name} feltöltése · {progress}%',
  uploadPreparing: 'A feltöltés előkészítése...',
  uploading: 'Feltöltés...',
  uploadPaused: 'A feltöltés szünetel.',
  uploadCompleted: 'A feltöltés elkészült.',
  uploadCancelled: 'A feltöltés megszakítva.',
  pause: 'Szünet',
  continue: 'Folytatás',
  cancelUpload: 'Feltöltés megszakítása',
  cancelAll: 'Összes megszakítása',
  queuedFiles: 'Még {count} fájl van a sorban.',
  uploadsToContinue: 'Folytatható feltöltések',
  emptyFolder: 'Ez a mappa üres.',
  emptyNote: 'Tölts fel egy fájlt, vagy hozz létre egy mappát.',
  noSearchResults: 'Nincs találat.',
  noSearchNote: 'Próbálj másik fájlnevet, vagy töröld a keresést.',
  noStorage: 'Nincs elérhető tárhely.',
  noStorageNote: 'Egy adminnak hozzá kell adnia vagy javítania kell egy tárhelyet.',
  notAvailable: 'Nem elérhető',
  readOnly: 'Csak olvasható',
  writable: 'Feltöltés engedélyezve',
  name: 'Név',
  size: 'Méret',
  changed: 'Módosítva',
  actions: 'Műveletek',
  loading: 'Fájlok betöltése...',
  searchFiles: 'Keresés fájlnév alapján',
  clearSearch: 'Keresés törlése',
  selectPage: 'Oldal kijelölése',
  selectItem: '{name} kijelölése',
  selectedCount: '{count} kijelölve',
  clearSelection: 'Kijelölés törlése',
  moveToTrash: 'Kukába helyezés',
  confirmDelete: 'A kukába helyezed ezt: „{name}”?',
  confirmBulkDelete: 'A kukába helyezel {count} kijelölt elemet?',
  deleteNote: 'Egy admin az API-n keresztül visszaállíthatja.',
  folderMade: 'A mappa elkészült.',
  renamed: 'Az elem új nevet kapott.',
  movedToTrash: 'Az elem a kukába került.',
  bulkTrashResult: '{moved} áthelyezve, {failed} sikertelen. Sikertelen elemek: {names}',
  linkCopied: 'A link kimásolva. A megnyitásához bejelentkezés szükséges.',
  linksCopied: 'A linkek kimásolva. A megnyitásukhoz bejelentkezés szükséges.',
  copyFailed: 'A linket nem sikerült másolni. Ellenőrizd a böngésző engedélyét.',
  noFileLinks: 'A kijelölésben nincs letölthető fájl.',
  theme: 'Téma',
  language: 'Nyelv',
  light: 'Világos',
  dark: 'Sötét',
  system: 'Rendszer',
  close: 'Bezárás',
  retry: 'Újra',
  breadcrumb: 'Jelenlegi mappa',
  pagination: 'Fájllapok',
  itemCount: '{count} elem',
  perPage: 'Oldalanként',
  previous: 'Előző',
  next: 'Következő',
  pageCount: '{page}. oldal / {total}',
  changeFailed: 'A módosítás nem sikerült.',
  uploadFailed: 'A feltöltés nem sikerült.',
  loginFailed: 'A belépés nem sikerült.',
}

export type TextKey = keyof typeof en
type Language = 'en' | 'hu'
type Values = Record<string, string | number>

type LanguageTools = {
  language: Language
  setLanguage: (language: Language) => void
  text: (key: TextKey, values?: Values) => string
}

const LanguageContext = createContext<LanguageTools | null>(null)

function fill(text: string, values: Values) {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`))
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const savedLanguage = localStorage.getItem('libretransfer-language')
  const [language, saveLanguage] = useState<Language>(savedLanguage === 'hu' ? 'hu' : 'en')
  const languageTools = useMemo<LanguageTools>(() => {
    const catalog = language === 'hu' ? hu : en
    return {
      language,
      setLanguage(next) {
        localStorage.setItem('libretransfer-language', next)
        document.documentElement.lang = next
        saveLanguage(next)
      },
      text(key, values = {}) {
        return fill(catalog[key], values)
      },
    }
  }, [language])

  return <LanguageContext.Provider value={languageTools}>{children}</LanguageContext.Provider>
}

export function useText() {
  const context = useContext(LanguageContext)
  if (!context) throw new Error('LanguageProvider is missing.')
  return context
}
