"use client";

import { useRouter } from "next/navigation";
import { VisualEditing, type VisualEditingProps } from "next-sanity/visual-editing";
import { useCallback } from "react";

export default function NativeVisualEditing() {
  const router = useRouter();
  const refresh = useCallback<NonNullable<VisualEditingProps["refresh"]>>(() => {
    // The SDK default ignores mutation refreshes. Presentation owns this event;
    // refresh the authorized server-rendered draft without a browser read token.
    router.refresh();
    return new Promise<void>((resolve) => setTimeout(resolve, 1_000));
  }, [router]);

  return <VisualEditing refresh={refresh} />;
}
