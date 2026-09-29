/*
 * RootBeer 라이브러리 기반 루팅탐지 우회 템플릿
 * 사용법: frida -U -f <package.name> -l root-rootbeer.js --no-pause
 * RootBeer는 com.scottyab.rootbeer.RootBeer 클래스가 표준 패키지명
 * 앱이 리패키징/난독화했으면 실제 클래스명을 jadx로 재확인 후 치환
 */

Java.perform(function () {
    console.log("[*] RootBeer 루팅탐지 우회 시작");

    try {
        var RootBeer = Java.use("com.scottyab.rootbeer.RootBeer");

        RootBeer.isRooted.implementation = function () {
            console.log("[+] RootBeer.isRooted() -> false 강제");
            return false;
        };

        RootBeer.isRootedWithoutBusyBoxCheck.implementation = function () {
            console.log("[+] RootBeer.isRootedWithoutBusyBoxCheck() -> false 강제");
            return false;
        };

        RootBeer.checkForBinary.implementation = function (filename) {
            console.log("[+] RootBeer.checkForBinary(" + filename + ") -> false 강제");
            return false;
        };

        RootBeer.detectRootManagementApps.overload().implementation = function () {
            return false;
        };

        RootBeer.detectTestKeys.implementation = function () {
            return false;
        };

        console.log("[+] Hooked: com.scottyab.rootbeer.RootBeer (전체 메서드)");
    } catch (e) {
        console.log("[-] RootBeer 클래스 없음, 다른 구현일 가능성 - root-detection.md 참고: " + e);
    }

    // 직접 su 바이너리 경로 체크하는 경우(File.exists 레벨)는 이 파일에서 개별 훅하지 않음.
    // emulator-detection.md의 File.exists 훅과 충돌하므로 scripts/bypass-templates/file-exists-guard.js
    // (통합 버전)를 별도로 로드해서 쓸 것. 자세한 원칙은 references/hook-merging.md 참고.
});

