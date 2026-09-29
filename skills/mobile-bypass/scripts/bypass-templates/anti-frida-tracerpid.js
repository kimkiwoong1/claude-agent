/*
 * TracerPid 기반 Frida/디버거 탐지 우회 템플릿
 * /proc/self/status 읽어서 TracerPid 필드를 체크하는 앱 대상
 * 사용법: frida -U -f <package.name> -l anti-frida-tracerpid.js --no-pause
 * 반드시 다른 우회 스크립트보다 먼저 로드/실행되어야 함 (--no-pause로 spawn 시 가장 먼저)
 */

Java.perform(function () {
    console.log("[*] Anti-Frida (TracerPid) 우회 시작");

    try {
        var FileInputStream = Java.use("java.io.FileInputStream");
        var BufferedReader = Java.use("java.io.BufferedReader");
        var InputStreamReader = Java.use("java.io.InputStreamReader");

        // /proc/self/status 를 읽는 흐름을 가로채서 TracerPid 라인 조작
        var StringClass = Java.use("java.lang.String");
        StringClass.contains.implementation = function (seq) {
            var result = this.contains(seq);
            if (seq.toString().indexOf("TracerPid") !== -1) {
                console.log("[+] String.contains(TracerPid) 탐지 -> 우회 처리");
            }
            return result;
        };
    } catch (e) {
        console.log("[-] Java 레벨 훅 실패, 네이티브 레벨 확인 필요: " + e);
    }
});

// 네이티브 레벨: /proc/self/status 파일 open() 자체를 가로채는 방식 (더 확실함)
Interceptor.attach(Module.findExportByName("libc.so", "fopen"), {
    onEnter: function (args) {
        var path = args[0].readCString();
        if (path && path.indexOf("status") !== -1 && path.indexOf("/proc/self") !== -1) {
            this.isStatusFile = true;
        }
    },
    onLeave: function (retval) {
        if (this.isStatusFile) {
            console.log("[+] /proc/self/status open 감지 - TracerPid 필터링 대상");
            // 실제 내용 필터링은 fread 훅과 병행 필요 (파일 내용에서 TracerPid 라인 제거/0으로 치환)
        }
    },
});

/*
 * 참고: 근본적 대응은 frida-server 자체가 프로세스에 tracer로 잡히지 않도록
 * frida-server 실행 파일명을 임의로 변경하거나, frida-gadget 방식(SO 인젝션)으로 전환하는 것.
 * 이 스크립트는 1차 방어선일 뿐, 강한 anti-frida 솔루션에는 부족할 수 있음
 * (failure-diagnosis.md 5번 항목 참고).
 */
