"""Install official FalkorDB macOS binaries from its pinned PyPI wheel.

The current Node platform package was observed to carry ELF binaries under its
darwin-arm64 name. Preserve the official wheel's library-relative paths instead.
No Python runtime dependency is added to the application.
"""
import pathlib,platform,subprocess,sys,tempfile,zipfile
if platform.system() != 'Darwin':
    print('Linux uses the official npm platform package; no macOS setup required.')
    raise SystemExit(0)
target=pathlib.Path('.data/native-wheel')
if (target/'redislite/bin/falkordb.so').exists():
    print('Native FalkorDB binaries already available.')
    raise SystemExit(0)
with tempfile.TemporaryDirectory(prefix='promisegraph-wheel-') as tmp:
    subprocess.run([sys.executable,'-m','pip','download','falkordblite==0.10.0','--only-binary=:all:','--no-deps','--dest',tmp],check=True)
    wheel=next(pathlib.Path(tmp).glob('*.whl'))
    with zipfile.ZipFile(wheel) as archive:
        for name in archive.namelist():
            if name.startswith(('redislite/bin/','redislite/.dylibs/','falkordblite-0.10.0.dist-info/licenses/')):
                archive.extract(name,target)
    for binary in (target/'redislite/bin').iterdir():
        binary.chmod(0o755)
print('Official FalkorDB macOS binaries prepared.')
