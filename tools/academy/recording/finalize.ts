import { finalizeRecording } from './nativeEvidence'

const args = process.argv.slice(2)
if (args.length !== 1 || !args[0]) {
  throw new Error('Usage: bun tools/academy/recording/finalize.ts <runDir>')
}
const result = await finalizeRecording(args[0])
console.log(JSON.stringify(result, null, 2))
if (result.status !== 'passed') {
  process.exitCode = 1
}
