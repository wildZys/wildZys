/**
 * @file: aihoge.js
 * @description: 获取 m.aihoge.com 请求头中的 member 项
 */

const headerName = 'member';
const storageKey = 'aihoge_member_token';

if ($request && $request.headers) {
    // 获取 member 项（兼容大小写）
    let memberVal = $request.headers[headerName] || $request.headers['Member'];

    if (memberVal) {
        // 读取上次保存的值，避免重复通知
        let savedVal = $persistentStore.read(storageKey);
        
        if (memberVal !== savedVal) {
            let success = $persistentStore.write(memberVal, storageKey);
            if (success) {
                $notification.post("Aihoge 插件", "成功获取 Member 项", memberVal);
                console.log(`[Aihoge] 成功更新 Member: ${memberVal}`);
            }
        }
    } else {
        console.log("[Aihoge] 未在请求头中找到 member 项");
    }
}

$done({});
