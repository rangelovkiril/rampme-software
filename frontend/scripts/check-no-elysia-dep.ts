/**
 * Eden derives the frontend's types from the backend's Elysia instance, and that
 * only works while both sides resolve to one copy of Elysia. tsconfig.json maps
 * the `elysia` specifier at ../backend/node_modules; a dependency declared here
 * would shadow it with a second copy, and treaty<App> would silently degrade to
 * a nominal mismatch on config.adapter rather than fail loudly.
 */
import pkg from '../package.json' with { type: 'json' }

const FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'] as const

const manifest: Partial<Record<(typeof FIELDS)[number], Record<string, string>>> = pkg

const offenders = FIELDS.filter((field) => manifest[field]?.elysia)

if (offenders.length > 0) {
  console.error(
    `frontend/package.json declares elysia in ${offenders.join(', ')}.\n` +
      "Remove it: a second Elysia instance breaks Eden's type derivation, and it fails\n" +
      'as a nominal type mismatch rather than a missing module, so it is easy to miss.\n' +
      'The specifier is mapped at ../backend/node_modules in tsconfig.json instead.',
  )
  process.exit(1)
}
