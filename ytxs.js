// 域名目标
const TARGET_DOMAIN = "apichuanti.scleader.cn";
// 存储键名
const STORE_KEY = "ytxs";

(function() {
    // 只处理目标域名的请求
    if (!new RegExp(TARGET_DOMAIN).test($request.url)) {
        $done({});
        return;
    }
    
    // 获取Authorization请求头
    const authHeader = $request.headers?.Authorization || 
                      $request.headers?.authorization;
    
    if (authHeader) {
        // 读取已保存的值
        const savedValue = $persistentStore.read(STORE_KEY);
        
        // 仅在新值不同时更新
        if (savedValue !== authHeader) {
            $persistentStore.write(authHeader, STORE_KEY);
            
            // 发送系统通知
            $notification.post(
                "引体向上CK已更新", 
                `捕获到新的Authorization头`,
                authHeader
            );
            
            console.log(`新CK捕获成功: ${authHeader}`);
        }
    }
    
    $done({});
})();