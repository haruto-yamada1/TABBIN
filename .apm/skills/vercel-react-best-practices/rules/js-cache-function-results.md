---
title: 繰り返し関数呼び出しをキャッシュ
impact: MEDIUM
impactDescription: 冗長な計算を回避
tags: javascript, cache, memoization, performance
---

## 繰り返し関数呼び出しをキャッシュ

レンダー中に同じ入力で同じ関数が繰り返し呼ばれる場合、モジュールレベルの Map で結果をキャッシュします。

**不適切（冗長な計算）:**

```typescript
function ProjectList({ projects }: { projects: Project[] }) {
  return (
    <div>
      {projects.map(project => {
        // slugify() called 100+ times for same project names
        const slug = slugify(project.name)
        
        return <ProjectCard key={project.id} slug={slug} />
      })}
    </div>
  )
}
```

**適切（結果をキャッシュ）:**

```typescript
// Module-level cache
const slugifyCache = new Map<string, string>()

function cachedSlugify(text: string): string {
  if (slugifyCache.has(text)) {
    return slugifyCache.get(text)!
  }
  const result = slugify(text)
  slugifyCache.set(text, result)
  return result
}

function ProjectList({ projects }: { projects: Project[] }) {
  return (
    <div>
      {projects.map(project => {
        // Computed only once per unique project name
        const slug = cachedSlugify(project.name)
        
        return <ProjectCard key={project.id} slug={slug} />
      })}
    </div>
  )
}
```

**単一値関数向けのより単純なパターン:**

```typescript
let isLoggedInCache: boolean | null = null

function isLoggedIn(): boolean {
  if (isLoggedInCache !== null) {
    return isLoggedInCache
  }
  
  isLoggedInCache = document.cookie.includes('auth=')
  return isLoggedInCache
}

// Clear cache when auth changes
function onAuthChange() {
  isLoggedInCache = null
}
```

フックではなく Map を使うことで、React コンポーネントだけでなくユーティリティやイベントハンドラーなどどこでも動作します。

参考: [How we made the Vercel Dashboard twice as fast](https://vercel.com/blog/how-we-made-the-vercel-dashboard-twice-as-fast)
