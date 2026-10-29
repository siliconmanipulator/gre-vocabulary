"""Reproducible native build using the inspected portable SDK. No content downloads."""
from pathlib import Path
import datetime,hashlib,json,os,subprocess,sys,zipfile
R=Path(__file__).resolve().parents[1]
T=Path(os.environ.get('GRE_ANDROID_TOOLS',R/'toolchain'))
J=next(T.glob('*/bin/javac.exe')).parent
B=next(T.glob('*/aapt2.exe')).parent
P=T/'android-35/android.jar'
W=R/'build/debug'
for x in ['classes','generated','dex']: (W/x).mkdir(parents=True,exist_ok=True)
def run(label,args):
    print(label,flush=True)
    result=subprocess.run([str(x) for x in args],capture_output=True,text=True,encoding='utf8',errors='replace')
    if result.returncode: raise RuntimeError(result.stdout+result.stderr)
    return result.stdout+result.stderr
# Bundled content is ready to build. Regeneration is a separate explicit step.
run('Compile native Android resources',[B/'aapt2.exe','compile','--dir',R/'app/res','-o',W/'resources.zip'])
run('Link manifest, resources and immutable content',[B/'aapt2.exe','link','-o',W/'resources.apk','-I',P,'--manifest',R/'app/AndroidManifest.xml','--java',W/'generated','--min-sdk-version','26','--target-sdk-version','35','-A',R/'app/assets',W/'resources.zip'])
sources=sorted((R/'app/src').rglob('*.java'))+sorted((W/'generated').rglob('*.java'))
run('Compile native Java UI and study engine',[J/'javac.exe','-encoding','UTF-8','-source','8','-target','8','-classpath',P,'-d',W/'classes',*sources])
with zipfile.ZipFile(W/'classes.jar','w',zipfile.ZIP_DEFLATED) as archive:
    for f in sorted((W/'classes').rglob('*.class')): archive.write(f,f.relative_to(W/'classes').as_posix())
run('D8: Java bytecode to Android DEX',[J/'java.exe','-cp',B/'lib/d8.jar','com.android.tools.r8.D8','--release','--min-api','26','--lib',P,'--output',W/'dex',W/'classes.jar'])
with zipfile.ZipFile(W/'resources.apk') as src,zipfile.ZipFile(W/'unsigned.apk','w') as dst:
    for info in src.infolist(): dst.writestr(info,src.read(info.filename))
    for f in (W/'dex').glob('*.dex'): dst.write(f,f.name,compress_type=zipfile.ZIP_DEFLATED)
run('Align APK',[B/'zipalign.exe','-f','4',W/'unsigned.apk',W/'aligned.apk'])
S=R/'signing';S.mkdir(exist_ok=True);key=S/'debug.p12'
if not key.exists():run('Create project-local debug key',[J/'keytool.exe','-genkeypair','-noprompt','-storetype','PKCS12','-keystore',key,'-alias','androiddebugkey','-storepass','android','-keypass','android','-keyalg','RSA','-keysize','2048','-validity','10000','-dname','CN=GRE Ascent Debug,O=Personal Study,C=IN'])
apk=W/'GRE-Ascent-1.0.1-debug.apk'
run('Sign debug APK',[J/'java.exe','-jar',B/'lib/apksigner.jar','sign','--ks',key,'--ks-key-alias','androiddebugkey','--ks-pass','pass:android','--key-pass','pass:android','--v4-signing-enabled','false','--out',apk,W/'aligned.apk'])
verify=run('Verify APK signatures',[J/'java.exe','-jar',B/'lib/apksigner.jar','verify','--verbose','--print-certs',apk])
align=run('Verify zip alignment',[B/'zipalign.exe','-c','-v','4',apk])
badging=run('Verify install metadata and permissions',[B/'aapt.exe','dump','badging',apk])
assert "package: name='com.greascent.app'" in badging
assert "sdkVersion:'26'" in badging and "targetSdkVersion:'35'" in badging
assert 'uses-permission:' not in badging
with zipfile.ZipFile(apk) as z:
    assert z.testzip() is None
    assert z.read('assets/content.json')==(R/'app/assets/content.json').read_bytes()
    assert z.read('classes.dex')[:4]==b'dex\n'
    assert not any(n.startswith('lib/') for n in z.namelist())
    assert not any(n.endswith(('.html','.js')) for n in z.namelist())
(W/'apk-verification.txt').write_text(verify+'\n'+align+'\n'+badging,encoding='utf8')
meta=dict(apk=str(apk),sha256=hashlib.sha256(apk.read_bytes()).hexdigest(),size=apk.stat().st_size,minSdk=26,targetSdk=35,versionName='1.0.1',versionCode=7,releaseSnapshot=False,package='com.greascent.app',nativeUI=True,permissions=[],abi='Universal DEX; no native libraries',signing='Project-local debug key',builtUtc=datetime.datetime.now(datetime.timezone.utc).isoformat())
(W/'build-result.json').write_text(json.dumps(meta,indent=2),encoding='utf8')
print(json.dumps(meta,indent=2))
