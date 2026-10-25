import {createClient} from '@supabase/supabase-js';
import {emptyData, readBackup, type FitnessData} from './lib/fitness';

export const backend = createClient('https://xiyphnbnjoxbgxampwak.supabase.co', 'sb_publishable_2bFrYaOn8fHTZDb5LpihBg_8T0-nXir');
const bucket = 'jianlian-private';
const json = (body: unknown, status = 200) => Response.json(body, {status});
const message = (error: {message: string}) => error.message.includes('Failed to fetch') ? '连接记录服务失败，请检查网络后重试。' : error.message;

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  try {
    const {data: {session}} = await backend.auth.getSession();
    if (!session) return json({error:'请先使用邮箱登录'},401);
    if (path === '/api/state') {
      if (options.method === 'PUT') {
        const {data,revision} = JSON.parse(String(options.body));
        const result = await backend.rpc('jianlian_save', {next_content: data, expected_revision: revision});
        if (result.error) return json({error: result.error.code === '40001' ? '另一台设备已更新记录，请刷新后重试。' : message(result.error)}, result.error.code === '40001' ? 409 : 400);
        return json({revision:result.data});
      }
      const result = await backend.from('jianlian_state').select('content,revision').eq('user_id',session.user.id).maybeSingle();
      if (result.error) throw result.error;
      return json({data:result.data?.content ?? emptyData, revision:result.data?.revision ?? 0});
    }
    if (path === '/api/photo' && options.method === 'POST') {
      const photo = (options.body as FormData).get('photo');
      if (!(photo instanceof File) || !['image/jpeg','image/png','image/webp'].includes(photo.type)) return json({error:'请选择 JPG、PNG 或 WebP 照片'},400);
      if (photo.size > 10 * 1024 * 1024) return json({error:'单张照片不能超过 10 MB'},413);
      const key = `${session.user.id}/${crypto.randomUUID()}`;
      const result = await backend.storage.from(bucket).upload(key,photo,{contentType:photo.type,upsert:false});
      if (result.error) throw result.error;
      return json({key});
    }
    if (path === '/api/photo/import') return json({error:'跨站照片请使用含照片的完整迁移备份导入。'},400);
    return json({error:'AI 功能尚未连接服务。可继续编辑和保存训练计划；饮食请在「吃有数」记录。'},503);
  } catch(error) { return json({error:message(error instanceof Error ? error : {message:String(error)})},500); }
}

export async function signedPhoto(key: string) {
  const result = await backend.storage.from(bucket).createSignedUrl(key,3600);
  if (result.error) throw result.error;
  return result.data.signedUrl;
}

export function photoKeys(data: FitnessData) {
  return [...new Set([...data.meals.map(meal=>meal.photoKey), ...data.photos.flatMap(photo=>['frontKey','sideKey','backKey'].map(key=>photo[key]))].filter((key): key is string=>typeof key === 'string' && Boolean(key)))];
}
export async function portableBackup(data: FitnessData) {
  const photos = [];
  for (const key of photoKeys(data)) {
    const result = await backend.storage.from(bucket).download(key);
    if (result.error) throw result.error;
    const dataUrl = await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('照片备份失败'));reader.readAsDataURL(result.data);});
    photos.push({key,dataUrl});
  }
  return {format:'jianlian-portable-v1',data,photos};
}
export async function importPhotos(raw: unknown) {
  const bundle = raw as {format?:string;data?:FitnessData;photos?:Array<{key:string;dataUrl:string}>};
  if (bundle?.format !== 'jianlian-portable-v1') {
    const data = readBackup(raw);
    for (const key of photoKeys(data)) {
      const result = await backend.storage.from(bucket).download(key);
      if (result.error) throw new Error('此备份的照片来自旧站，请使用含照片的完整迁移备份。原有记录未替换。');
    }
    return data;
  }
  if (!bundle.data || !Array.isArray(bundle.photos)) throw new Error('迁移备份格式无效');
  const data = readBackup(structuredClone(bundle.data));
  const mapped = new Map<string,string>();
  for (const photo of bundle.photos) {
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(photo.dataUrl)) throw new Error('备份中的照片格式无效');
    const comma = photo.dataUrl.indexOf(',');
    const bytes = Uint8Array.from(atob(photo.dataUrl.slice(comma+1)), c=>c.charCodeAt(0));
    const file = new File([bytes],'photo',{type:photo.dataUrl.slice(5,photo.dataUrl.indexOf(';'))});
    const form = new FormData();form.append('photo',file);
    const response = await apiFetch('/api/photo',{method:'POST',body:form});
    const result = await response.json();if (!response.ok) throw new Error(result.error);
    mapped.set(photo.key,result.key);
  }
  for (const key of photoKeys(data)) if (!mapped.has(key)) throw new Error('备份缺少照片，原有记录未替换');
  for (const meal of data.meals) if (meal.photoKey) {meal.photoKey = mapped.get(meal.photoKey);delete meal.photoUrl;}
  for (const photo of data.photos) for (const key of ['frontKey','sideKey','backKey']) if (typeof photo[key] === 'string') photo[key] = mapped.get(photo[key] as string);
  return data;
}
