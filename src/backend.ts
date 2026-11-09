import {emptyData, readBackup, type FitnessData} from './lib/fitness.ts';

type SavedState = {data: FitnessData; revision: number};
const json = (body: unknown, status = 200) => Response.json(body, {status});
let database: Promise<IDBDatabase> | undefined;

function openDatabase() {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('jianlian-local', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('records');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('无法打开浏览器存储。请使用普通浏览窗口后重试。'));
    }).catch(error => {
      database = undefined;
      throw error;
    });
  }
  return database;
}

async function read<T>(key: string): Promise<T | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('records').objectStore('records').get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(new Error('读取本机记录失败'));
  });
}

async function saveState(data: FitnessData, revision: number, photos: Map<string, Blob> = new Map()) {
  const db = await openDatabase();
  return new Promise<number>((resolve, reject) => {
    const transaction = db.transaction('records', 'readwrite');
    const records = transaction.objectStore('records');
    const previous = records.get('state');
    previous.onsuccess = () => {
      if ((previous.result?.revision ?? 0) !== revision) {
        transaction.abort();
        reject(new Error('这个浏览器的另一个页面已修改记录，请刷新后重试。'));
        return;
      }
      for (const [key, photo] of photos) records.put(photo, 'photo:' + key);
      records.put({data, revision: revision + 1}, 'state');
    };
    transaction.oncomplete = () => resolve(revision + 1);
    transaction.onabort = () => reject(new Error('保存失败，请检查浏览器存储空间后重试。'));
  });
}

async function savePhoto(key: string, photo: Blob) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('records', 'readwrite');
    transaction.objectStore('records').put(photo, 'photo:' + key);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(new Error('照片保存失败，请检查浏览器存储空间。'));
  });
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  try {
    if (path === '/api/state') {
      if (options.method === 'PUT') {
        const {data, revision} = JSON.parse(String(options.body));
        return json({revision: await saveState(data, revision)});
      }
      return json(await read<SavedState>('state') ?? {data: emptyData, revision: 0});
    }
    if (path === '/api/photo' && options.method === 'POST') {
      const photo = (options.body as FormData).get('photo');
      if (!(photo instanceof File) || !['image/jpeg', 'image/png', 'image/webp'].includes(photo.type)) {
        return json({error: '请选择 JPG、PNG 或 WebP 照片'}, 400);
      }
      if (photo.size > 10 * 1024 * 1024) return json({error: '单张照片不能超过 10 MB'}, 413);
      const key = crypto.randomUUID();
      await savePhoto(key, photo);
      return json({key});
    }
    return json({error: 'AI 功能暂不可用。训练和饮食记录可继续在本机保存。'}, 503);
  } catch (error) {
    return json({error: error instanceof Error ? error.message : '浏览器存储操作失败'}, 500);
  }
}

export async function localPhoto(key: string) {
  const photo = await read<Blob>('photo:' + key);
  if (!photo) throw new Error('找不到本机照片');
  return photo;
}

function photoKeys(data: FitnessData) {
  const keys = [
    ...data.meals.map(meal => meal.photoKey),
    ...data.photos.flatMap(photo => ['frontKey', 'sideKey', 'backKey'].map(key => photo[key])),
  ];
  return [...new Set(keys.filter((key): key is string => typeof key === 'string' && Boolean(key)))];
}

export async function portableBackup(data: FitnessData) {
  const photos = [];
  for (const key of photoKeys(data)) {
    const photo = await localPhoto(key);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('照片备份失败'));
      reader.readAsDataURL(photo);
    });
    photos.push({key, dataUrl});
  }
  return {format: 'jianlian-portable-v1', data, photos};
}

export async function importBackup(raw: unknown, revision: number) {
  const bundle = raw as {format?: string; data?: unknown; photos?: Array<{key: string; dataUrl: string}>};
  const portable = bundle?.format === 'jianlian-portable-v1';
  const data = readBackup(portable ? bundle.data : raw);
  const photos = new Map<string, Blob>();
  if (portable) {
    if (!Array.isArray(bundle.photos)) throw new Error('迁移备份格式无效');
    for (const {key, dataUrl} of bundle.photos) {
      const header = /^data:(image\/(?:jpeg|png|webp));base64,/.exec(dataUrl);
      if (typeof key !== 'string' || !header) throw new Error('备份中的照片格式无效');
      const bytes = Uint8Array.from(atob(dataUrl.slice(header[0].length)), char => char.charCodeAt(0));
      photos.set(key, new Blob([bytes], {type: header[1]}));
    }
  }
  for (const key of photoKeys(data)) {
    if (!photos.has(key) && !await read<Blob>('photo:' + key)) {
      throw new Error('备份缺少照片，请使用含照片的完整备份。原有记录未替换。');
    }
  }
  for (const meal of data.meals) {
    if (meal.photoUrl && !meal.photoKey) throw new Error('旧备份只有照片链接，请使用含照片的完整备份。');
    delete meal.photoUrl;
  }
  return {data, revision: await saveState(data, revision, photos)};
}
