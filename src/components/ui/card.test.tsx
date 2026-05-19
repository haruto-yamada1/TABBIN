// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card'

describe('card ui', () => {
  it('各スロットを描画してクラスを引き継ぐ', () => {
    render(
      <Card className='card-extra'>
        <CardHeader className='header-extra'>
          <CardTitle className='title-extra'>Title</CardTitle>
          <CardDescription className='description-extra'>
            Description
          </CardDescription>
          <CardAction className='action-extra'>Action</CardAction>
        </CardHeader>
        <CardContent className='content-extra'>Content</CardContent>
        <CardFooter className='footer-extra'>Footer</CardFooter>
      </Card>,
    )

    expect(screen.getByText('Title').className).toContain('title-extra')
    expect(screen.getByText('Title').className).toContain('font-semibold')
    expect(screen.getByText('Description').className).toContain(
      'description-extra',
    )
    expect(screen.getByText('Description').className).toContain(
      'text-muted-foreground',
    )
    expect(screen.getByText('Content').className).toContain('content-extra')
    expect(screen.getByText('Footer').className).toContain('footer-extra')
    expect(screen.getByText('Action').className).toContain('action-extra')
    expect(
      screen.getByText('Title').closest('.card-extra')?.className,
    ).toContain('rounded-xl')
    expect(screen.getByText('Title').parentElement?.className).toContain(
      'header-extra',
    )
  })
})
