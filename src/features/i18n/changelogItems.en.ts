import type { ChangelogItem } from './changelogTypes'

const changelogItemsEn: ChangelogItem[] = [
  {
    date: '2026-03-14',
    features: [
      {
        text: 'Added a sidebar chat experience that lets you work with saved tabs without leaving the current screen. Use it to research and organize without switching contexts.',
      },
      {
        text: 'Preview: added analytics so you can review patterns in saved tabs with charts and summaries.',
      },
      {
        text: 'Made Custom Mode generally available. Project-specific organization and management are now safer and easier to use.',
      },
      {
        text: 'Various usability improvements and minor fixes.',
      },
    ],
    version: '2.0.0',
  },
  {
    date: '2026-02-27',
    features: [
      {
        text: 'Added the ability to remove an item from its original list when a drag-and-drop move succeeds.',
      },
      {
        text: 'Various improvements including performance gains and bug fixes.',
      },
    ],
    version: '1.2.0',
  },
  {
    date: '2025-04-29',
    features: [
      {
        text: 'Added a powerful search feature. Just type a keyword to quickly find saved tabs.',
      },
      {
        text: 'Refreshed the design to make the app easier to use and easier to scan.',
      },
      {
        text: 'Confirmation dialogs now appear when tabs or categories are deleted, helping prevent mistakes.',
      },
      {
        text: 'Domains and categories can now be temporarily collapsed, so you can focus on the information you need.',
      },
      {
        text: 'Sorting by registration date now supports ascending and descending order, making it easy to review newer or older saved tabs.',
      },
      {
        text: 'Added a background-tab open option so you can open saved tabs without interrupting your current work.',
      },
      {
        text: 'Preview: implemented Custom Mode for more flexible configuration.',
      },
      {
        text: "Preview: added color customization so you can change the app's appearance to match your preference.",
      },
      {
        text: 'Various improvements including performance gains and bug fixes.',
      },
    ],
    version: '1.1.0',
  },
  {
    date: '2025-03-21',
    features: [
      {
        text: 'Initial release. Categories, quick access, and efficient organization for tabs and bookmarks.',
      },
    ],
    version: '1.0.0',
  },
]

export { changelogItemsEn }
