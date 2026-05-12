"use client";

import { preconnect, prefetchDNS } from "react-dom";

export function ResourceHints() {
    preconnect("https://nyc.cloud.appwrite.io");
    prefetchDNS("https://nyc.cloud.appwrite.io");

    return null;
}
