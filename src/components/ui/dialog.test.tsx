// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from './dialog'

describe('Dialogコンポーネント', () => {
  it('トリガーとクローズを描画する', () => {
    render(
      <Dialog open>
        <DialogTrigger>Open Dialog</DialogTrigger>
        <DialogContent>
          <DialogTitle>Dialog Title</DialogTitle>
          <DialogDescription>Dialog Description</DialogDescription>
          <DialogClose>Close Dialog</DialogClose>
        </DialogContent>
      </Dialog>,
    )

    const trigger = screen.getByRole('button', {
      name: 'Open Dialog',
      hidden: true,
    })
    expect(trigger.tagName).toBe('BUTTON')

    const close = screen.getByRole('button', { name: 'Close Dialog' })
    expect(close.tagName).toBe('BUTTON')
    expect(screen.getByText('Dialog Title')).toBeTruthy()
    expect(screen.getByText('Dialog Description')).toBeTruthy()
  })
})
