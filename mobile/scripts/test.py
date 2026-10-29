"""Run portable Java engine tests without private files or historical Git commits."""
from pathlib import Path
import json, os, shutil, subprocess

ROOT = Path(__file__).resolve().parents[1]
tools = Path(os.environ.get('GRE_ANDROID_TOOLS', ROOT/'toolchain'))
matches = list(tools.glob('*/bin/javac.exe'))
javac = str(matches[0]) if matches else shutil.which('javac')
if not javac:
    raise SystemExit('Install JDK 17 and put javac on PATH, or set GRE_ANDROID_TOOLS.')
java = str(Path(javac).with_name('java.exe' if javac.endswith('.exe') else 'java'))
work = ROOT/'build/tests'
work.mkdir(parents=True,exist_ok=True)
def run(args):
    subprocess.run([str(x) for x in args],cwd=ROOT,check=True)
names = ['EngineTests','FocusTests','RepetitionTests','MemoryTests','PhysicsTests']
run([javac,'-encoding','UTF-8','-source','8','-target','8','-d',work,ROOT/'app/src/com/greascent/app/StudyEngine.java',ROOT/'app/src/com/greascent/app/SpringPhysics.java',*[ROOT/'tests'/(n+'.java') for n in names]])
for name in names:
    run([java,'-cp',work,name])
run([java,'-cp',work,'EngineTests','write',work/'persistence.bin'])
run([java,'-cp',work,'EngineTests','read',work/'persistence.bin'])
for name,filename in [('FocusTests','focus-state.bin'),('RepetitionTests','repetition-state.bin'),('MemoryTests','memory-state.bin')]:
    run([java,'-cp',work,name,'read',work/filename])
data=json.loads((ROOT/'app/assets/content.json').read_text(encoding='utf8'))
assert len(data['words']) == 959 and len(data['questions']) == 354
assert len({w['id'] for w in data['words']}) == 959
(work/'words.tsv').write_text('\n'.join('\t'.join([w['id'],w['term'],w['meaning'],str(w['order']),','.join(w['families'])]) for w in data['words']),encoding='utf8')
run([java,'-cp',work,'EngineTests','real',work/'words.tsv'])
print('All portable mobile checks passed. Android runtime is a separate check.')
