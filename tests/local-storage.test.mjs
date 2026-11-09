import assert from 'node:assert/strict';
import {test} from 'node:test';
import {IDBFactory} from 'fake-indexeddb';
import {emptyData, saveDailyTraining} from '../src/lib/fitness.ts';

let instance = 0;
async function openApp() {
  return import('../src/backend.ts?instance=' + instance++);
}

test('training and photos persist when the app is reopened', async () => {
  globalThis.indexedDB = new IDBFactory();
  const app = await openApp();
  const data = saveDailyTraining(emptyData, '2026-11-09', 'free', '浏览器保存测试', [{name: '测试动作', totalSets: 2}]);
  const file = new File(['local-image'], 'photo.jpg', {type: 'image/jpeg'});
  const form = new FormData();
  form.append('photo', file);
  const savedPhoto = await app.apiFetch('/api/photo', {method: 'POST', body: form});
  assert.equal(savedPhoto.ok, true);
  const {key} = await savedPhoto.json();
  data.photos = [{frontKey: key}];
  const saved = await app.apiFetch('/api/state', {method: 'PUT', body: JSON.stringify({data, revision: 0})});
  assert.equal(saved.ok, true);

  const reopened = await openApp();
  const restored = await (await reopened.apiFetch('/api/state')).json();
  assert.deepEqual(restored, {data, revision: 1});
  assert.equal(await (await reopened.localPhoto(key)).text(), 'local-image');
  const stale = await app.apiFetch('/api/state', {method: 'PUT', body: JSON.stringify({data: emptyData, revision: 0})});
  assert.equal(stale.ok, false);
  assert.deepEqual(await (await reopened.apiFetch('/api/state')).json(), restored);
});

test('backup import saves records and photos together and rejects an incomplete backup', async () => {
  globalThis.indexedDB = new IDBFactory();
  const app = await openApp();
  const data = {...emptyData, photos: [{sideKey: 'imported-photo'}]};
  const bundle = {format: 'jianlian-portable-v1', data, photos: []};
  await assert.rejects(app.importBackup(bundle, 0), /备份缺少照片/);
  assert.equal((await (await app.apiFetch('/api/state')).json()).revision, 0);
  bundle.photos.push({key: 'imported-photo', dataUrl: 'data:image/png;base64,aGVsbG8='});
  assert.equal((await app.importBackup(bundle, 0)).revision, 1);
  assert.equal(await (await app.localPhoto('imported-photo')).text(), 'hello');
  assert.deepEqual((await (await app.apiFetch('/api/state')).json()).data, data);
});
