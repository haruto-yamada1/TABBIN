/**
 * contexts 側 `SavedTabsRoute` (production 実行経路)。
 *
 * 旧 `features/saved-tabs/routes/SavedTabsRoute` と同じ component を
 * contexts 配下の path から読み込めるよう再エクスポートする。
 *
 * この Issue (#474) は DDD 移行の production 実行経路切り替え PR として
 * AppRouter の lazy import 先を features から contexts 側へ向けることが
 * 目的で、UI コンポーネントの contexts 移植は対象外。後続 Issue で
 * contexts/presentation/components に Header / DomainModeContainer /
 * CustomModeContainer などを移植し、`SavedTabsPresentationLayout` などを
 * 用意して本ファイルを本物に置き換える。
 *
 * 旧 features 側の route / test は本 Issue のスコープ外として残し、
 * 後続 Issue で整理する。
 */
export { SavedTabsRoute } from '@/features/saved-tabs/routes/SavedTabsRoute'
