const getViewportWidthSnapshot = () => window.innerWidth

const getLeftPaneWidthStoreSnapshot = (width: number | null) =>
  width ?? getViewportWidthSnapshot()

export { getLeftPaneWidthStoreSnapshot }
