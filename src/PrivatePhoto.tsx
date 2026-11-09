import {useEffect, useState} from 'react';
import {localPhoto} from './backend';

export function PrivatePhoto({photoKey, alt}: {photoKey: string; alt: string}) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    setUrl('');
    setFailed(false);
    localPhoto(photoKey).then(photo => {
      if (!active) return;
      objectUrl = URL.createObjectURL(photo);
      setUrl(objectUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoKey]);
  return url && !failed
    ? <img src={url} alt={alt} onError={() => setFailed(true)} />
    : <span className="fine">{failed ? '照片读取失败' : '正在读取照片…'}</span>;
}
