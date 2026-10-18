"""Build a private native Firefox benchmark from the reviewed shared fixtures.

Run from a checkout with its frozen dependencies and Firefox artifacts built.
Only a new temporary directory is written; tracked sources are never modified.
"""

import json
from pathlib import Path
import tempfile

repo = Path(__file__).resolve().parents[2]
scratch = Path(tempfile.mkdtemp(prefix="tabbin-native-search-"))


def replace_once(source, old, new):
    """Replace a unique source marker, rejecting lifecycle recipe drift."""
    if source.count(old) != 1:
        raise RuntimeError(f"Native recipe source changed: expected one {old!r}")
    return source.replace(old, new, 1)


lifecycle = (repo / "tools/scripts/firefox-persistence-indexeddb-smoke.ts").read_text()
marker = "const run = async (): Promise<void> => {"
if lifecycle.count(marker) != 1:
    raise RuntimeError("Native smoke lifecycle boundary changed")
prefix = lifecycle.split(marker)[0]
prefix = replace_once(prefix, "path.resolve(import.meta.dirname, '../..')", json.dumps(str(repo)))
prefix = replace_once(prefix, "'./stagedOpeningMeasurementContract'", json.dumps(str(repo / "tools/scripts/stagedOpeningMeasurementContract.ts")))
prefix = replace_once(prefix, "delete manifest.background", "// Keep the production background for actual search UI.")

helper = (repo / "e2e/helpers/search-performance.ts").read_text()
helper = helper.replace("'@/", "'" + str(repo / "src") + "/")
helper = helper.replace("'@playwright/test'", json.dumps(str(repo / "node_modules/@playwright/test/index.mjs")))
helper = replace_once(helper, "'./extension'", json.dumps(str(repo / "e2e/helpers/extension.ts")))
helper += "\nexport { createSearchFixture, installInputProbe }\n"
shared = scratch / "search-performance.ts"
shared.write_text(helper)

body = (repo / "docs/testing/native-firefox-search.ts.txt").read_text()
body = replace_once(body, "path.join(repoRoot, 'e2e/helpers/search-performance.ts')", json.dumps(str(shared)))
runner = scratch / "runner.ts"
runner.write_text(prefix + body)
print(runner)
