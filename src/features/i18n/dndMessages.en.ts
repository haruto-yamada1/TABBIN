const dndMessagesEn = {
  'savedTabs.dnd.instructions':
    'Tab to a reorder handle. Press Space or Enter to pick up one item. Use the arrow keys to move, Space or Enter to drop, and Escape to cancel the current drag.',
  'savedTabs.dnd.customInstructions':
    'For tabs, Up and Down reorder within the category first. At the ends, or with Left and Right, move to a category, uncategorized area, or another project in that direction.',
  'savedTabs.dnd.confirmHint':
    'The order is a preview. Tab to Confirm reorder to save, or Cancel reorder to discard it.',
  'savedTabs.dnd.saveHint':
    'The drop starts saving. The result will be announced.',
  'savedTabs.dnd.pickedUp': 'Picked up one item: {{name}}.',
  'savedTabs.dnd.position': 'Position {{position}} of {{count}}.',
  'savedTabs.dnd.over': '{{name}} is over {{target}}.',
  'savedTabs.dnd.dropped': 'Dropped {{name}} over {{target}}.',
  'savedTabs.dnd.canceled':
    'Canceled the drag of {{name}}. No change was saved.',
  'savedTabs.dnd.noTarget': '{{name}} has no drop target.',
  'savedTabs.dnd.saved': 'Reordered one tab.',
  'savedTabs.dnd.saveError': 'Could not save the order. Try again.',
} as const

export { dndMessagesEn }
