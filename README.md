# Loon 通用请求头参数捕获插件模板

## 文件说明
- `loon_plugin.ini` ：Loon 插件配置模板，修改后可直接导入 Loon 使用。
- `token_template.js` ：Loon 通用参数捕获脚本，可抓取任意请求头参数。

## 使用步骤
1. 修改 `loon_plugin.ini` 中的 `pattern`，填入你要抓取的接口域名。
2. 修改 `script-path`，改为你上传后的脚本地址（支持 GitHub/Gist/CDN）。
3. 修改 `token_template.js` 文件中的：
   - `targetHeader`：你要抓取的请求头名称（如 `Authorization`、`access-token`）
   - `storageKey`：你希望存储到 Loon 的本地 key 名
4. 在 Loon 插件页导入该插件，启用即可。

## 示例
抓取域名：`api.example.com`，抓取参数：`Authorization`

配置如下：
```ini
[Script]
通用Token抓取 = type=http-request, pattern=^https:\/\/api\.example\.com\/, requires-body=0, script-path=https://你的托管地址/token_template.js, timeout=10

[MITM]
hostname = api.example.com
```

修改脚本：
```javascript
const targetHeader = "Authorization";
const storageKey = "example_auth";
```

成功后，可以通过 `$persistentStore.read("example_auth")` 读取 token。

## 支持平台
- Loon
