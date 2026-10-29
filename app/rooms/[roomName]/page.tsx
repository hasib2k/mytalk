import * as React from 'react';
import { PageClientImpl } from './PageClientImpl';
import { isVideoCodec } from '@/lib/types';
import { getLiveKitURL } from '@/lib/getLiveKitURL';
import { verifyHostToken } from '@/lib/adminAuth';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ roomName: string }>;
  searchParams: Promise<{
    region?: string;
    hq?: string;
    codec?: string;
    singlePC?: string;
    role?: string;
    hk?: string;
  }>;
}) {
  const _params = await params;
  const _searchParams = await searchParams;
  const codec =
    typeof _searchParams.codec === 'string' && isVideoCodec(_searchParams.codec)
      ? _searchParams.codec
      : 'vp9';
  const hq = _searchParams.hq === 'true' ? true : false;
  const singlePC = _searchParams.singlePC !== 'false';
  // Resolve the role authoritatively: the "host" role is only honoured when a
  // valid signed host token is present. This makes the pre-join UI show the
  // REAL role (a bare ?role=host without a token is just a listener).
  const rawHostKey = _searchParams.hk ?? '';
  const isValidHost =
    _searchParams.role === 'host' && verifyHostToken(rawHostKey, _params.roomName);
  const role = isValidHost ? 'host' : 'listener';
  const hostKey = isValidHost ? rawHostKey : '';
  const serverUrl = process.env.LIVEKIT_URL
    ? getLiveKitURL(process.env.LIVEKIT_URL, _searchParams.region ?? null)
    : undefined;

  return (
    <PageClientImpl
      roomName={_params.roomName}
      serverUrl={serverUrl}
      region={_searchParams.region}
      hq={hq}
      codec={codec}
      singlePeerConnection={singlePC}
      role={role}
      hostKey={hostKey}
    />
  );
}
