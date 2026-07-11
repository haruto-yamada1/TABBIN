/**
 * localStorage への safe access adapter。
 *
 * presentation / feature / component 層が localStorage を直接触らないようにする
 * ため (issue #646)、この adapter 経由でアクセスする。SSR / test 環境の
 * `typeof window === 'undefined'` と quota error を吸収する。
 */

export function readLocalStorage(key: string): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeLocalStorage(key: string, value: string): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // localStorage が使えない環境では書き込みをスキップする
  }
}
