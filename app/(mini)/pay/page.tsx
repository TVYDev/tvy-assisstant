"use client";

import { useEffect, useState } from "react";
import { SnapshotCards } from "@/components/mini/snapshot-cards";
import { ErrorBanner, LoadingBlock, PageHeader } from "@/components/mini/ui";
import { useMiniApp } from "@/components/mini/provider";
import { useMiniGet } from "@/components/mini/use-mini-get";
import { miniGetBlob } from "@/components/mini/api";
import type { OweSnapshot } from "@/lib/owe-message";

export default function PayPage() {
  const { initData, status } = useMiniApp();
  const { data, error, loading } = useMiniGet<OweSnapshot>("/api/mini/owe");
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "ready" || !initData) return;
    let objectUrl: string | null = null;
    void miniGetBlob("/api/mini/qr", initData)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setQrUrl(objectUrl);
      })
      .catch((err: unknown) => {
        setQrError(err instanceof Error ? err.message : "Could not load QR");
      });
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [initData, status]);

  return (
    <>
      <PageHeader title="Pay Vannyou" subtitle="Scan the KHQR to settle your tab" />
      {error || qrError ? <ErrorBanner message={error ?? qrError ?? ""} /> : null}
      {loading || !data ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="card bg-base-200 mb-4">
            <div className="card-body items-center">
              {qrUrl ? (
                // QR is an authenticated blob, not a remote next/image source
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrUrl}
                  alt="KHQR payment code"
                  className="w-full max-w-xs rounded-box bg-white p-3"
                />
              ) : (
                <div className="skeleton h-64 w-64" />
              )}
              {data.netOwed > 0 ? (
                <p className="text-sm">
                  Amount due: <span className="font-semibold">${data.netOwed.toFixed(2)}</span>
                </p>
              ) : (
                <p className="text-sm opacity-70">Nothing due right now.</p>
              )}
            </div>
          </div>
          <SnapshotCards snapshot={data} />
        </>
      )}
    </>
  );
}
