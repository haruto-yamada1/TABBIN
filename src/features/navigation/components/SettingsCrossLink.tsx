import { Link, useInRouterContext } from 'react-router-dom'

import {
  getAppEntryHref,
  getAppRoute,
} from '@/features/navigation/lib/pageNavigation'
import type { SidebarItemId } from '@/features/navigation/lib/pageNavigation'

type SettingsCrossLinkProps = {
  className?: string
  item: SidebarItemId
  label: string
}

const settingsCrossLinkClassName =
  'font-medium text-primary underline underline-offset-4 hover:text-primary/80'

/**
 * 設定画面同士を繋ぐ相互リンク。アプリ内では React Router の Link、
 * ルーター外（単体表示やテスト）では app.html への通常リンクになる。
 */
export const SettingsCrossLink = ({
  className,
  item,
  label,
}: SettingsCrossLinkProps) => {
  const isInRouterContext = useInRouterContext()
  const route = getAppRoute(item)
  const linkClassName = className ?? settingsCrossLinkClassName

  if (isInRouterContext) {
    return (
      <Link className={linkClassName} to={route}>
        {label}
      </Link>
    )
  }

  return (
    <a className={linkClassName} href={getAppEntryHref(route)}>
      {label}
    </a>
  )
}
