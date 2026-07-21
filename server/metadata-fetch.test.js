import assert from "node:assert/strict";
import test from "node:test";
import {
  MetadataFetchError,
  fetchPublicHtml,
  isPublicIpAddress,
  parsePublicHttpUrl,
  resolvePublicHost,
} from "./metadata-fetch.js";

test("public address filter rejects private and special IPv4/IPv6 ranges", () => {
  for (const address of [
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "198.18.0.1",
    "224.0.0.1",
    "::",
    "::1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
  ]) {
    assert.equal(isPublicIpAddress(address), false, address);
  }

  for (const address of ["1.1.1.1", "93.184.216.34", "2606:4700:4700::1111"]) {
    assert.equal(isPublicIpAddress(address), true, address);
  }
});

test("URL validation permits public web URLs and rejects risky URL features", () => {
  assert.equal(parsePublicHttpUrl("https://example.com/product").href, "https://example.com/product");

  for (const [input, code] of [
    ["file:///etc/passwd", "unsupported_protocol"],
    ["https://user:secret@example.com/product", "url_credentials"],
    ["https://example.com:8443/product", "unsupported_port"],
    ["not a url", "invalid_url"],
  ]) {
    assert.throws(
      () => parsePublicHttpUrl(input),
      (error) => error instanceof MetadataFetchError && error.code === code,
    );
  }
});

test("DNS validation rejects a hostname if any answer is not public", async () => {
  await assert.rejects(
    resolvePublicHost(new URL("https://shop.example/product"), async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]),
    (error) => error instanceof MetadataFetchError && error.code === "unsafe_address",
  );
});

test("redirect targets are DNS-checked before the next request", async () => {
  const requested = [];
  const request = async (url) => {
    requested.push(url.href);
    return {
      statusCode: 302,
      headers: { location: "http://169.254.169.254/latest/meta-data/" },
      body: Buffer.alloc(0),
    };
  };
  const lookup = async () => [{ address: "93.184.216.34", family: 4 }];

  await assert.rejects(
    fetchPublicHtml("https://shop.example/product", { lookup, request }),
    (error) => error instanceof MetadataFetchError && error.code === "unsafe_address",
  );
  assert.deepEqual(requested, ["https://shop.example/product"]);
});

test("safe relative redirects are followed and return the final URL", async () => {
  const requested = [];
  const request = async (url) => {
    requested.push(url.href);
    if (requested.length === 1) {
      return { statusCode: 301, headers: { location: "/canonical" }, body: Buffer.alloc(0) };
    }
    return {
      statusCode: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: Buffer.from("<title>Product</title>"),
    };
  };
  const lookup = async () => [{ address: "93.184.216.34", family: 4 }];

  const result = await fetchPublicHtml("https://shop.example/old", { lookup, request });
  assert.deepEqual(requested, ["https://shop.example/old", "https://shop.example/canonical"]);
  assert.equal(result.url.href, "https://shop.example/canonical");
  assert.equal(result.html, "<title>Product</title>");
});

test("one timeout budget covers the complete fetch", async () => {
  const request = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  const lookup = async () => [{ address: "93.184.216.34", family: 4 }];

  await assert.rejects(
    fetchPublicHtml("https://shop.example/product", { lookup, request, timeoutMs: 20 }),
    (error) => error instanceof MetadataFetchError && error.code === "request_timeout" && error.status === 504,
  );
});

test("the timeout budget also covers DNS resolution", async () => {
  const lookup = async () => new Promise(() => {});

  await assert.rejects(
    fetchPublicHtml("https://shop.example/product", { lookup, timeoutMs: 20 }),
    (error) => error instanceof MetadataFetchError && error.code === "request_timeout" && error.status === 504,
  );
});

test("non-HTML and unsuccessful upstream responses are rejected", async () => {
  const lookup = async () => [{ address: "93.184.216.34", family: 4 }];

  await assert.rejects(
    fetchPublicHtml("https://shop.example/image", {
      lookup,
      request: async () => ({
        statusCode: 200,
        headers: { "content-type": "image/jpeg" },
        body: Buffer.from("not really an image"),
      }),
    }),
    (error) => error instanceof MetadataFetchError && error.code === "not_html",
  );

  await assert.rejects(
    fetchPublicHtml("https://shop.example/missing", {
      lookup,
      request: async () => ({ statusCode: 404, headers: {}, body: Buffer.from("missing") }),
    }),
    (error) => error instanceof MetadataFetchError && error.code === "upstream_status",
  );
});

test("HTML without a content type is sniffed and legacy encodings are decoded", async () => {
  const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const windows1251Title = Buffer.from([0xcf, 0xee, 0xe4, 0xe0, 0xf0, 0xee, 0xea]);
  const body = Buffer.concat([
    Buffer.from('<html><head><meta charset="windows-1251"><title>'),
    windows1251Title,
    Buffer.from("</title></head></html>"),
  ]);

  const result = await fetchPublicHtml("https://shop.example/product", {
    lookup,
    request: async () => ({ statusCode: 200, headers: {}, body, truncated: false }),
  });

  assert.match(result.html, /<title>Подарок<\/title>/);
});
