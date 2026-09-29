/*
 * 범용 X509TrustManager 우회 템플릿 (모든 인증서 신뢰)
 * 사용법: frida -U -f <package.name> -l ssl-trustmanager.js --no-pause
 * 커스텀 TrustManager 클래스명을 알고 있으면 CUSTOM_CLASS 부분에 추가로 훅할 것
 */

Java.perform(function () {
    console.log("[*] SSL Pinning bypass (TrustManager 전체 무력화) 시작");

    var TrustManager = Java.registerClass({
        name: "com.pentest.bypass.TrustAllManager",
        implements: [Java.use("javax.net.ssl.X509TrustManager")],
        methods: {
            checkClientTrusted: function (chain, authType) {},
            checkServerTrusted: function (chain, authType) {},
            getAcceptedIssuers: function () {
                return [];
            },
        },
    });

    var SSLContext = Java.use("javax.net.ssl.SSLContext");
    var TrustManagerArray = Java.array("[Ljavax.net.ssl.TrustManager;", [TrustManager.$new()]);

    SSLContext.init.overload(
        "[Ljavax.net.ssl.KeyManager;",
        "[Ljavax.net.ssl.TrustManager;",
        "java.security.SecureRandom"
    ).implementation = function (keyManagers, trustManagers, secureRandom) {
        console.log("[+] SSLContext.init() 우회 - 모든 인증서 신뢰로 교체");
        this.init(keyManagers, TrustManagerArray, secureRandom);
    };

    // 대상 앱이 커스텀 TrustManager 클래스를 쓰는 경우 여기에 추가:
    // try {
    //     var CustomTM = Java.use("com.target.app.network.CustomTrustManager");
    //     CustomTM.checkServerTrusted.implementation = function (chain, authType) {
    //         console.log("[+] CustomTrustManager.checkServerTrusted() 우회");
    //     };
    // } catch (e) {
    //     console.log("[-] CustomTrustManager 없음: " + e);
    // }
});
