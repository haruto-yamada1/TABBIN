"""Generate or run native Firefox selection proof using reviewed lifecycle helpers.

From a checkout with frozen dependencies and a Firefox artifact:
    bun run build:firefox
    GECKODRIVER_PATH=/path/to/geckodriver \
      FIREFOX_EXECUTABLE_PATH=/path/to/firefox \
      python3 docs/testing/reproduce-firefox-selection.py --run

Without --run, print the generated temporary TypeScript runner path. The runner
seeds and reads storage and drives real WebDriver mouse/keyboard actions against
a temporary XPI with the production background. No tracked source is changed.
"""

import argparse
import json
from pathlib import Path
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--run", action="store_true", help="Run the generated proof with Bun")
args = parser.parse_args()
repo = Path(__file__).resolve().parents[2]
scratch = Path(tempfile.mkdtemp(prefix="tabbin-native-selection-"))


def replace_once(source, old, new):
    """Reject source drift at the shared native lifecycle boundary."""
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

helper = (repo / "e2e/helpers/selection.ts").read_text()
helper = helper.replace("'@/", "'" + str(repo / "src") + "/")
helper = helper.replace("'@axe-core/playwright'", json.dumps(str(repo / "node_modules/@axe-core/playwright/dist/index.mjs")))
helper = helper.replace("'@playwright/test'", json.dumps(str(repo / "node_modules/@playwright/test/index.mjs")))
helper = replace_once(helper, "'./extension'", json.dumps(str(repo / "e2e/helpers/extension.ts")))
shared = scratch / "selection.ts"
shared.write_text(helper)

body = (repo / "docs/testing/native-firefox-selection.ts.txt").read_text()
body = replace_once(body, "path.join(repoRoot, 'e2e/helpers/selection.ts')", json.dumps(str(shared)))
runner = scratch / "runner.ts"
runner.write_text(prefix + body)
if args.run:
    subprocess.run(["bun", str(runner)], cwd=repo, check=True)
else:
    print(runner)
