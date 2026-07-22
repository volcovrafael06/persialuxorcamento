import { supabase } from '../supabase/client';

const BUCKET_NAME = 'images';
const PUBLIC_MARKER = `/storage/v1/object/public/${BUCKET_NAME}/`;
const SIGNED_MARKER = `/storage/v1/object/sign/${BUCKET_NAME}/`;

export const getStoragePath = value => {
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) return value.replace(/^\/+/, '');

  const marker = value.includes(PUBLIC_MARKER) ? PUBLIC_MARKER : SIGNED_MARKER;
  const markerIndex = value.indexOf(marker);
  if (markerIndex === -1) return null;

  return decodeURIComponent(value.slice(markerIndex + marker.length).split('?')[0]);
};

export const storageService = {
  async getLogoUrl(value) {
    if (!value) return null;

    const path = getStoragePath(value);
    if (!path) return value;

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(path, 7 * 24 * 60 * 60);

    if (error) throw error;
    return data.signedUrl;
  }
};
