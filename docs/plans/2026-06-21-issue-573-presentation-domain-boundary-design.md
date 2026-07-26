# Issue 573 Presentation Domain Boundary Design

## Goal

Prevent saved-tabs presentation code from depending on domain entities, value
objects, repositories, or services, without hiding those dependencies behind a
re-export facade.

## Boundaries

- Application DTOs contain only plain primitive values and readonly arrays.
- Application mappers own domain entity to DTO conversion.
- Presentation-facing commands accept primitive values. Application code
  validates and converts them to branded domain values.
- Presentation reads data through application queries and invokes changes
  through application use cases.
- Browser and storage side effects remain behind application ports.
- Presentation tests use application DTO fixtures or injected application
  contracts. They do not import domain factories or repositories.

## Migration Strategy

1. Remove `SavedTabsPresentationBoundary.ts` and restore direct imports so the
   dependency-cruiser rule exposes the real violations.
2. Introduce explicit application DTOs and mapping tests.
3. Convert query and use-case public contracts to DTOs and primitives.
4. Remove repositories from presentation controller/page/context inputs.
5. Move presentation-consumed domain service operations behind application
   services.
6. Migrate production presentation code, then presentation tests.
7. Verify that dependency-cruiser reports zero presentation-to-domain edges.

## Non-Goals

- Relaxing dependency-cruiser, lint, or coverage configuration.
- Adding path exclusions for tests or specific presentation files.
- Re-exporting domain symbols from application.
- Changing saved-tabs behavior or UI.
