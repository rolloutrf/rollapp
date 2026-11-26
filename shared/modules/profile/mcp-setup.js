export const rollappMcpUrl = "https://xn--80avakiab.xn--p1ai/mcp";

export const codexKeychainCommand = "/usr/bin/security add-generic-password -U -a rollapp -s 'Rollapp MCP' -w";

export const codexKeychainHeaderHelper = String.raw`export LC_ALL=C
token=$(/usr/bin/security find-generic-password -a rollapp -s 'Rollapp MCP' -w) || exit 1
case "$token" in *[!A-Za-z0-9_-]*) exit 1 ;; esac
printf '%s\n' "$token" | /usr/bin/grep -Eq '^rwmcp_(read|write)_[A-Za-z0-9_-]{43}$' || exit 1
printf '{"Authorization":"Bearer %s"}\n' "$token"`;

export const codexMacConfig = `[mcp_servers.rollapp]
url = "${rollappMcpUrl}"
http_headers_helper = '''
${codexKeychainHeaderHelper}
'''`;
