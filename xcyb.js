let url = $request.url;
let headers = $request.headers;

let vayne = headers["x-vayne"] || "未找到";
let teemo = headers["x-teemo"] || "未找到";
let sivir = headers["x-sivir"] || "未找到";

let output = `${vayne}#${teemo}#${sivir}`;
console.log(`=== ${new Date().toLocaleString()} ===`);
console.log(`请求URL: ${url}`);
console.log(`请求头值: ${output}`);
console.log(`\n`);

// 发送通知（可选，方便手机上查看）
$notification.post("抓取成功", "gw.xiaocantech.com/rpc", output);

// 返回原请求，不做任何修改
$done({});
