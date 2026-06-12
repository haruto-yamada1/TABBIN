import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('https://demo.playwright.dev/todomvc')
})

const TODO_ITEMS = [
  'buy some cheese',
  'feed the cat',
  'book a doctors appointment',
] as const

const addTodoItems = async (page: Page, items: readonly string[]) => {
  const newTodo = page.getByPlaceholder('What needs to be done?')

  const addNext = async (index: number): Promise<void> => {
    const item = items[index]
    if (!item) {
      return
    }
    await newTodo.fill(item)
    await newTodo.press('Enter')
    await addNext(index + 1)
  }

  await addNext(0)
}

test.describe('新しい ToDo', () => {
  test('ToDo 項目を追加できる', async ({ page }) => {
    // create a new todo locator
    const newTodo = page.getByPlaceholder('What needs to be done?')

    // Create 1st todo.
    await newTodo.fill(TODO_ITEMS[0])
    await newTodo.press('Enter')

    // Make sure the list only has one todo item.
    await expect(page.getByTestId('todo-title')).toHaveText([TODO_ITEMS[0]])

    // Create 2nd todo.
    await newTodo.fill(TODO_ITEMS[1])
    await newTodo.press('Enter')

    // Make sure the list now has two todo items.
    await expect(page.getByTestId('todo-title')).toHaveText([
      TODO_ITEMS[0],
      TODO_ITEMS[1],
    ])

    await checkNumberOfTodosInLocalStorage(page, 2)
  })

  test('項目追加時にテキスト入力欄がクリアされる', async ({ page }) => {
    // create a new todo locator
    const newTodo = page.getByPlaceholder('What needs to be done?')

    // Create one todo item.
    await newTodo.fill(TODO_ITEMS[0])
    await newTodo.press('Enter')

    // Check that input is empty.
    await expect(newTodo).toBeEmpty()
    await checkNumberOfTodosInLocalStorage(page, 1)
  })

  test('新しい項目がリストの末尾に追加される', async ({ page }) => {
    // Create 3 items.
    await createDefaultTodos(page)

    // create a todo count locator
    const todoCount = page.getByTestId('todo-count')

    // Check test using different methods.
    await expect(page.getByText('3 items left')).toBeVisible()
    await expect(todoCount).toHaveText('3 items left')
    await expect(todoCount).toContainText('3')
    await expect(todoCount).toHaveText(/3/)

    // Check all items in one call.
    await expect(page.getByTestId('todo-title')).toHaveText(TODO_ITEMS)
    await checkNumberOfTodosInLocalStorage(page, 3)
  })
})

test.describe('すべて完了にする', () => {
  test.beforeEach(async ({ page }) => {
    await createDefaultTodos(page)
    await checkNumberOfTodosInLocalStorage(page, 3)
  })

  test.afterEach(async ({ page }) => {
    await checkNumberOfTodosInLocalStorage(page, 3)
  })

  test('すべての項目を完了にできる', async ({ page }) => {
    // Complete all todos.
    await page.getByLabel('Mark all as complete').check()

    // Ensure all todos have 'completed' class.
    await expect(page.getByTestId('todo-item')).toHaveClass([
      'completed',
      'completed',
      'completed',
    ])
    await checkNumberOfCompletedTodosInLocalStorage(page, 3)
  })

  test('すべての項目の完了状態を解除できる', async ({ page }) => {
    const toggleAll = page.getByLabel('Mark all as complete')
    // Check and then immediately uncheck.
    await toggleAll.check()
    await toggleAll.uncheck()

    // Should be no completed classes.
    await expect(page.getByTestId('todo-item')).toHaveClass(['', '', ''])
  })

  test('項目の完了/解除に応じて「すべて完了」チェックボックスの状態が更新される', async ({
    page,
  }) => {
    const toggleAll = page.getByLabel('Mark all as complete')
    await toggleAll.check()
    await expect(toggleAll).toBeChecked()
    await checkNumberOfCompletedTodosInLocalStorage(page, 3)

    // Uncheck first todo.
    const firstTodo = page.getByTestId('todo-item').nth(0)
    await firstTodo.getByRole('checkbox').uncheck()

    // Reuse toggleAll locator and make sure its not checked.
    await expect(toggleAll).not.toBeChecked()

    await firstTodo.getByRole('checkbox').check()
    await checkNumberOfCompletedTodosInLocalStorage(page, 3)

    // Assert the toggle all is checked again.
    await expect(toggleAll).toBeChecked()
  })
})

test.describe('個別アイテム', () => {
  test('項目を完了にできる', async ({ page }) => {
    // Create two items.
    await addTodoItems(page, TODO_ITEMS.slice(0, 2))

    // Check first item.
    const firstTodo = page.getByTestId('todo-item').nth(0)
    await firstTodo.getByRole('checkbox').check()
    await expect(firstTodo).toHaveClass('completed')

    // Check second item.
    const secondTodo = page.getByTestId('todo-item').nth(1)
    await expect(secondTodo).not.toHaveClass('completed')
    await secondTodo.getByRole('checkbox').check()

    // Assert completed class.
    await expect(firstTodo).toHaveClass('completed')
    await expect(secondTodo).toHaveClass('completed')
  })

  test('項目の完了を解除できる', async ({ page }) => {
    // Create two items.
    await addTodoItems(page, TODO_ITEMS.slice(0, 2))

    const firstTodo = page.getByTestId('todo-item').nth(0)
    const secondTodo = page.getByTestId('todo-item').nth(1)
    const firstTodoCheckbox = firstTodo.getByRole('checkbox')

    await firstTodoCheckbox.check()
    await expect(firstTodo).toHaveClass('completed')
    await expect(secondTodo).not.toHaveClass('completed')
    await checkNumberOfCompletedTodosInLocalStorage(page, 1)

    await firstTodoCheckbox.uncheck()
    await expect(firstTodo).not.toHaveClass('completed')
    await expect(secondTodo).not.toHaveClass('completed')
    await checkNumberOfCompletedTodosInLocalStorage(page, 0)
  })

  test('項目を編集できる', async ({ page }) => {
    await createDefaultTodos(page)

    const todoItems = page.getByTestId('todo-item')
    const secondTodo = todoItems.nth(1)
    await secondTodo.dblclick()
    await expect(secondTodo.getByRole('textbox', { name: 'Edit' })).toHaveValue(
      TODO_ITEMS[1],
    )
    await secondTodo
      .getByRole('textbox', { name: 'Edit' })
      .fill('buy some sausages')
    await secondTodo.getByRole('textbox', { name: 'Edit' }).press('Enter')

    // Explicitly assert the new text value.
    await expect(todoItems).toHaveText([
      TODO_ITEMS[0],
      'buy some sausages',
      TODO_ITEMS[2],
    ])
    await checkTodosInLocalStorage(page, 'buy some sausages')
  })
})

test.describe('編集', () => {
  test.beforeEach(async ({ page }) => {
    await createDefaultTodos(page)
    await checkNumberOfTodosInLocalStorage(page, 3)
  })

  test('編集中は他のコントロールを非表示にする', async ({ page }) => {
    const todoItem = page.getByTestId('todo-item').nth(1)
    await todoItem.dblclick()
    await expect(todoItem.getByRole('checkbox')).not.toBeVisible()
    await expect(
      todoItem.locator('label', {
        hasText: TODO_ITEMS[1],
      }),
    ).not.toBeVisible()
    await checkNumberOfTodosInLocalStorage(page, 3)
  })

  test('blur 時に編集内容を保存する', async ({ page }) => {
    const todoItems = page.getByTestId('todo-item')
    await todoItems.nth(1).dblclick()
    await todoItems
      .nth(1)
      .getByRole('textbox', { name: 'Edit' })
      .fill('buy some sausages')
    await todoItems
      .nth(1)
      .getByRole('textbox', { name: 'Edit' })
      .dispatchEvent('blur')

    await expect(todoItems).toHaveText([
      TODO_ITEMS[0],
      'buy some sausages',
      TODO_ITEMS[2],
    ])
    await checkTodosInLocalStorage(page, 'buy some sausages')
  })

  test('入力テキストをトリムする', async ({ page }) => {
    const todoItems = page.getByTestId('todo-item')
    await todoItems.nth(1).dblclick()
    await todoItems
      .nth(1)
      .getByRole('textbox', { name: 'Edit' })
      .fill('    buy some sausages    ')
    await todoItems.nth(1).getByRole('textbox', { name: 'Edit' }).press('Enter')

    await expect(todoItems).toHaveText([
      TODO_ITEMS[0],
      'buy some sausages',
      TODO_ITEMS[2],
    ])
    await checkTodosInLocalStorage(page, 'buy some sausages')
  })

  test('空文字列が入力された場合は項目を削除する', async ({ page }) => {
    const todoItems = page.getByTestId('todo-item')
    await todoItems.nth(1).dblclick()
    await todoItems.nth(1).getByRole('textbox', { name: 'Edit' }).fill('')
    await todoItems.nth(1).getByRole('textbox', { name: 'Edit' }).press('Enter')

    await expect(todoItems).toHaveText([TODO_ITEMS[0], TODO_ITEMS[2]])
  })

  test('Escape で編集をキャンセルする', async ({ page }) => {
    const todoItems = page.getByTestId('todo-item')
    await todoItems.nth(1).dblclick()
    await todoItems
      .nth(1)
      .getByRole('textbox', { name: 'Edit' })
      .fill('buy some sausages')
    await todoItems
      .nth(1)
      .getByRole('textbox', { name: 'Edit' })
      .press('Escape')
    await expect(todoItems).toHaveText(TODO_ITEMS)
  })
})

test.describe('カウンター', () => {
  test('現在の ToDo 項目数を表示する', async ({ page }) => {
    // create a new todo locator
    const newTodo = page.getByPlaceholder('What needs to be done?')

    // create a todo count locator
    const todoCount = page.getByTestId('todo-count')

    await newTodo.fill(TODO_ITEMS[0])
    await newTodo.press('Enter')

    await expect(todoCount).toContainText('1')

    await newTodo.fill(TODO_ITEMS[1])
    await newTodo.press('Enter')
    await expect(todoCount).toContainText('2')

    await checkNumberOfTodosInLocalStorage(page, 2)
  })
})

test.describe('完了済みクリアボタン', () => {
  test.beforeEach(async ({ page }) => {
    await createDefaultTodos(page)
  })

  test('正しいテキストを表示する', async ({ page }) => {
    await page.locator('.todo-list li .toggle').first().check()
    await expect(
      page.getByRole('button', { name: 'Clear completed' }),
    ).toBeVisible()
  })

  test('クリック時に完了済み項目を削除する', async ({ page }) => {
    const todoItems = page.getByTestId('todo-item')
    await todoItems.nth(1).getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Clear completed' }).click()
    await expect(todoItems).toHaveCount(2)
    await expect(todoItems).toHaveText([TODO_ITEMS[0], TODO_ITEMS[2]])
  })

  test('完了済み項目がないときは非表示になる', async ({ page }) => {
    await page.locator('.todo-list li .toggle').first().check()
    await page.getByRole('button', { name: 'Clear completed' }).click()
    await expect(
      page.getByRole('button', { name: 'Clear completed' }),
    ).toBeHidden()
  })
})

test.describe('永続化', () => {
  test('データを永続化する', async ({ page }) => {
    await addTodoItems(page, TODO_ITEMS.slice(0, 2))

    const todoItems = page.getByTestId('todo-item')
    const firstTodoCheck = todoItems.nth(0).getByRole('checkbox')
    await firstTodoCheck.check()
    await expect(todoItems).toHaveText([TODO_ITEMS[0], TODO_ITEMS[1]])
    await expect(firstTodoCheck).toBeChecked()
    await expect(todoItems).toHaveClass(['completed', ''])

    // Ensure there is 1 completed item.
    await checkNumberOfCompletedTodosInLocalStorage(page, 1)

    // Now reload.
    await page.reload()
    await expect(todoItems).toHaveText([TODO_ITEMS[0], TODO_ITEMS[1]])
    await expect(firstTodoCheck).toBeChecked()
    await expect(todoItems).toHaveClass(['completed', ''])
  })
})

test.describe('ルーティング', () => {
  test.beforeEach(async ({ page }) => {
    await createDefaultTodos(page)
    // make sure the app had a chance to save updated todos in storage
    // before navigating to a new view, otherwise the items can get lost :(
    // in some frameworks like Durandal
    await checkTodosInLocalStorage(page, TODO_ITEMS[0])
  })

  test('未完了項目を表示できる', async ({ page }) => {
    const todoItem = page.getByTestId('todo-item')
    await page.getByTestId('todo-item').nth(1).getByRole('checkbox').check()

    await checkNumberOfCompletedTodosInLocalStorage(page, 1)
    await page.getByRole('link', { name: 'Active' }).click()
    await expect(todoItem).toHaveCount(2)
    await expect(todoItem).toHaveText([TODO_ITEMS[0], TODO_ITEMS[2]])
  })

  test('戻るボタンを反映する', async ({ page }) => {
    const todoItem = page.getByTestId('todo-item')
    await page.getByTestId('todo-item').nth(1).getByRole('checkbox').check()

    await checkNumberOfCompletedTodosInLocalStorage(page, 1)

    await test.step('Showing all items', async () => {
      await page.getByRole('link', { name: 'All' }).click()
      await expect(todoItem).toHaveCount(3)
    })

    await test.step('Showing active items', async () => {
      await page.getByRole('link', { name: 'Active' }).click()
    })

    await test.step('Showing completed items', async () => {
      await page.getByRole('link', { name: 'Completed' }).click()
    })

    await expect(todoItem).toHaveCount(1)
    await page.goBack()
    await expect(todoItem).toHaveCount(2)
    await page.goBack()
    await expect(todoItem).toHaveCount(3)
  })

  test('完了済み項目を表示できる', async ({ page }) => {
    await page.getByTestId('todo-item').nth(1).getByRole('checkbox').check()
    await checkNumberOfCompletedTodosInLocalStorage(page, 1)
    await page.getByRole('link', { name: 'Completed' }).click()
    await expect(page.getByTestId('todo-item')).toHaveCount(1)
  })

  test('すべての項目を表示できる', async ({ page }) => {
    await page.getByTestId('todo-item').nth(1).getByRole('checkbox').check()
    await checkNumberOfCompletedTodosInLocalStorage(page, 1)
    await page.getByRole('link', { name: 'Active' }).click()
    await page.getByRole('link', { name: 'Completed' }).click()
    await page.getByRole('link', { name: 'All' }).click()
    await expect(page.getByTestId('todo-item')).toHaveCount(3)
  })

  test('現在適用中のフィルターを強調表示する', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'All' })).toHaveClass(
      'selected',
    )

    //create locators for active and completed links
    const activeLink = page.getByRole('link', { name: 'Active' })
    const completedLink = page.getByRole('link', { name: 'Completed' })
    await activeLink.click()

    // Page change - active items.
    await expect(activeLink).toHaveClass('selected')
    await completedLink.click()

    // Page change - completed items.
    await expect(completedLink).toHaveClass('selected')
  })
})

const createDefaultTodos = async (page: Page) => {
  await addTodoItems(page, TODO_ITEMS)
}

const checkNumberOfTodosInLocalStorage = async (
  page: Page,
  expected: number,
) => {
  return page.waitForFunction(
    (e) => JSON.parse(localStorage['react-todos']).length === e,
    expected,
  )
}

const checkNumberOfCompletedTodosInLocalStorage = async (
  page: Page,
  expected: number,
) => {
  return page.waitForFunction(
    (e) =>
      JSON.parse(localStorage['react-todos']).filter(
        (todo: { completed: boolean }) => todo.completed,
      ).length === e,
    expected,
  )
}

const checkTodosInLocalStorage = async (page: Page, title: string) => {
  return page.waitForFunction(
    (t) =>
      JSON.parse(localStorage['react-todos'])
        .map((todo: { title: string }) => todo.title)
        .includes(t),
    title,
  )
}
