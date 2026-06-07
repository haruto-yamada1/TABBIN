/* eslint-disable max-lines-per-function, typescript/no-misused-promises */
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { Field, FieldDescription, FieldError, FieldLabel } from './field'

describe('Fieldコンポーネント', () => {
  afterEach(() => {
    cleanup()
  })

  it('data-invalid のとき説明とエラー表示をまとめて描画できる', () => {
    render(
      <Field data-invalid>
        <FieldLabel htmlFor='field-input'>Invalid Input</FieldLabel>
// eslint-disable-next-line jsx-a11y/control-has-associated-label
        <input aria-describedby='field-error' id='field-input' />
        <FieldDescription>Helper text</FieldDescription>
        <FieldError id='field-error'>
          This field contains validation errors.
        </FieldError>
      </Field>,
    )

    const group = screen.getByRole('group')
    const description = screen.getByText('Helper text')
    const error = screen.getByRole('alert')

    expect(group.getAttribute('data-invalid')).toBe('true')
    expect(description.className).toContain(
      'group-data-[invalid=true]/field:text-destructive',
    )
    expect(error.textContent).toBe('This field contains validation errors.')
  })

  it('orientation を className に反映する', () => {
    const { getByRole } = render(
      <Field orientation='horizontal'>
        <FieldLabel htmlFor='horizontal-input'>Label</FieldLabel>
// eslint-disable-next-line jsx-a11y/control-has-associated-label
        <input id='horizontal-input' />
      </Field>,
    )

    expect(getByRole('group').className).toContain('flex-row')
  })
})
