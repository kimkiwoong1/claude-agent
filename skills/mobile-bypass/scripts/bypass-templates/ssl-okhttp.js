/*
 * OkHttp CertificatePinner 우회 템플릿
 * 사용법: frida -U -f <package.name> -l ssl-okhttp.js --no-pause
 * 커스터마이징: 대상 앱이 커스텀 OkHttpClient 빌더를 쓰면 클래스명이 다를 수 있음
 *              env-triage.md 2단계에서 확인한 실제 패키지 구조에 맞게 조정
 */

Java.perform(function () {
    console.log("[*] SSL Pinning bypass (OkHttp) 시작");

    try {
        var CertificatePinner = Java.use("okhttp3.CertificatePinner");
        CertificatePinner.check.overload("java.lang.String", "java.util.List").implementation = function (hostname, certs) {
            console.log("[+] CertificatePinner.check() 우회: " + hostname);
            return;
        };
        console.log("[+] Hooked: okhttp3.CertificatePinner.check(String, List)");
    } catch (e) {
        console.log("[-] CertificatePinner 훅 실패 (해당 클래스 없음 가능): " + e);
    }

    try {
        var CertificatePinner2 = Java.use("okhttp3.CertificatePinner");
        CertificatePinner2.check.overload("java.lang.String", "[Ljava.security.cert.Certificate;").implementation = function (hostname, certs) {
            console.log("[+] CertificatePinner.check() (Certificate[] overload) 우회: " + hostname);
            return;
        };
        console.log("[+] Hooked: okhttp3.CertificatePinner.check(String, Certificate[])");
    } catch (e) {
        console.log("[-] Certificate[] overload 없음 (버전에 따라 정상): " + e);
    }
});
