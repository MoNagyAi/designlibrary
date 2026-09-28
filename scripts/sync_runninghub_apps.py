import json, os, re, time
from pathlib import Path
from urllib.request import Request, urlopen

BASE = os.environ.get('RUNNINGHUB_BASE_URL', 'https://www.runninghub.ai').rstrip('/')
USER_ID = os.environ.get('RUNNINGHUB_USER_ID', '1956406247538995201')
INVITE_CODE = os.environ.get('RUNNINGHUB_INVITE_CODE', 'qfviaawx')
OUT = Path(os.environ.get('RUNNINGHUB_OUT', 'runninghub-apps-data.json'))

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36',
    'Content-Type': 'application/json',
    'Origin': BASE,
    'Referer': f'{BASE}/user-center/{USER_ID}',
}

def post_json(path, payload, timeout=30):
    req = Request(BASE + path, data=json.dumps(payload).encode('utf-8'), headers=HEADERS, method='POST')
    with urlopen(req, timeout=timeout) as r:
        body = r.read().decode('utf-8', 'replace')
    data = json.loads(body)
    if isinstance(data, dict) and str(data.get('code', '0')) not in ('0','200','None') and data.get('data') is None:
        raise RuntimeError(f'RunningHub API error: {data.get("code")} {data.get("msg") or data.get("message")}')
    return data

def first_nonempty(obj, keys):
    if not isinstance(obj, dict): return ''
    for k in keys:
        v = obj.get(k)
        if isinstance(v, str) and v.strip(): return v.strip()
    return ''

def find_image(obj):
    preferred = ('thumbnailUri','thumbnailUrl','thumbnail','coverUrl','coverUri','webappCover','webappCoverUrl','cover','imageUrl','image','poster','posterUrl')
    if isinstance(obj, dict):
        direct = first_nonempty(obj, preferred)
        if direct and direct.startswith(('http://','https://')): return direct
        for k in ('covers','coverList','images','imageList','materials'):
            v = obj.get(k)
            if isinstance(v, list):
                for x in v:
                    found = find_image(x)
                    if found: return found
        for k,v in obj.items():
            lk = str(k).lower()
            if any(bad in lk for bad in ('avatar','userhead','headimg','profile')): continue
            if any(good in lk for good in ('cover','thumb','image','poster')):
                found = find_image(v)
                if found: return found
    elif isinstance(obj, list):
        for x in obj:
            found = find_image(x)
            if found: return found
    elif isinstance(obj, str):
        s=obj.strip()
        if s.startswith(('http://','https://')) and re.search(r'\.(?:png|jpe?g|webp|gif)(?:\?|$)', s, re.I): return s
    return ''

def clean_text(s):
    s = re.sub(r'<[^>]+>', ' ', s or '')
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def build_instructions(title, intro):
    text = (title + ' ' + intro).lower()
    ar = ['افتح التطبيق وسجّل الدخول إلى RunningHub إذا طُلب منك.']
    en = ['Open the app and sign in to RunningHub if prompted.']
    if any(x in text for x in ('image to video','image-to-video','i2v','صورة إلى فيديو')):
        ar += ['ارفع الصورة المطلوبة، وأضف الوصف أو الإعدادات الظاهرة داخل التطبيق.']
        en += ['Upload the source image, then enter the prompt or settings shown in the app.']
    elif any(x in text for x in ('text to video','text-to-video','t2v','نص إلى فيديو')):
        ar += ['اكتب وصف الفيديو في خانة النص، ثم اضبط المدة والمقاس إن كانت متاحة.']
        en += ['Enter the video prompt, then set duration and aspect ratio when available.']
    elif any(x in text for x in ('lip sync','lipsync','lip-sync','ليبسينج','مزامنة')):
        ar += ['ارفع الصورة أو الفيديو وملف الصوت حسب الحقول الموجودة في التطبيق.']
        en += ['Upload the image or video and the audio file using the available input fields.']
    elif any(x in text for x in ('reference','references','مرجع','مراجع')):
        ar += ['ارفع الصور المرجعية المطلوبة بالترتيب، ثم أضف وصف الحركة أو المشهد إن كان متاحًا.']
        en += ['Upload the requested reference images in order, then add motion or scene instructions when available.']
    elif any(x in text for x in ('upscale','seedvr','enhance','repair','تحسين','تكبير')):
        ar += ['ارفع الصورة أو الفيديو المطلوب تحسينه واضبط إعدادات الجودة المتاحة.']
        en += ['Upload the image or video to enhance and adjust the available quality settings.']
    elif any(x in text for x in ('sound','audio','foley','sfx','صوت','مؤثر')):
        ar += ['ارفع المصدر المطلوب أو اكتب الوصف الصوتي حسب الحقول الظاهرة.']
        en += ['Upload the source or enter the audio description using the available controls.']
    else:
        ar += ['أدخل الملفات أو الوصف المطلوب في الحقول الظاهرة داخل التطبيق.']
        en += ['Provide the requested files or prompt using the fields shown in the app.']
    ar += ['اضغط Run Now وانتظر النتيجة في My Results.']
    en += ['Select Run Now and wait for the result in My Results.']
    return '\n'.join(ar), '\n'.join(en)

def main():
    records=[]; seen=set(); current=1; size=50
    while current <= 50:
        res = post_json('/api/webapp/user/list', {'userId':USER_ID,'current':current,'size':size,'keyword':'','sortType':'newest'})
        data = res.get('data') if isinstance(res,dict) else None
        page = data.get('records',[]) if isinstance(data,dict) else []
        if not page: break
        added=0
        for item in page:
            if not isinstance(item,dict): continue
            app_id=str(item.get('webappId') or item.get('id') or '').strip()
            if not app_id or app_id in seen: continue
            seen.add(app_id); records.append(item); added+=1
        if added == 0 or len(page) < size: break
        current += 1

    apps=[]
    for i,item in enumerate(records,1):
        app_id=str(item.get('webappId') or item.get('id'))
        detail={}
        try:
            d=post_json('/api/webapp/detail', {'webappId':app_id})
            detail=d.get('data') if isinstance(d,dict) and isinstance(d.get('data'),dict) else {}
        except Exception as e:
            detail={'_detailError':str(e)}
        name = first_nonempty(detail, ('webappName','name','title')) or first_nonempty(item, ('webappName','name','title')) or f'RunningHub App {app_id}'
        intro = first_nonempty(detail, ('description','intro','introduction','webappIntro','appIntroduction','content','remark')) or first_nonempty(item, ('description','intro','introduction','webappIntro','remark'))
        intro = clean_text(intro)
        image = find_image(detail) or find_image(item)
        ins_ar, ins_en = build_instructions(name, intro)
        apps.append({
            'id': f'runninghub-{app_id}',
            'webappId': app_id,
            'order': i,
            'originalTitle': name,
            'ar': name,
            'en': name,
            'descriptionAr': intro[:420] if intro else 'تطبيق من تطبيقات Mohamed Nagy على RunningHub.',
            'descriptionEn': intro[:420] if intro else 'A Mohamed Nagy app on RunningHub.',
            'image': image,
            'url': f'{BASE}/ai-detail/{app_id}?inviteCode={INVITE_CODE}',
            'instructionsAr': ins_ar,
            'instructionsEn': ins_en,
            'enabled': True,
            'status': 'live',
            'free': False,
        })
        time.sleep(0.05)
    payload={'schemaVersion':1,'userId':USER_ID,'inviteCode':INVITE_CODE,'count':len(apps),'apps':apps}
    OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Wrote {len(apps)} apps to {OUT}')

if __name__=='__main__': main()
