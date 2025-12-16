(async () => {
   let enabled = (await httpAPI("v1/modules")).enabled.includes("ipv6");
   
   let modules; 
   if ($argument !== "net") {
      modules = rule();
   } else {
      modules = Net();
   }

   if (`${enabled}` !== `${modules}`) {
      console.log(`IPv6: ${enabled} -> ${modules}`);
      await httpAPI("/v1/modules", "POST", { ipv6: `${modules}` });
      // DNS刷新
      const dns = await httpAPI('/v1/dns/flush', 'POST');
      console.log(`DNS Flushed`);
   } else {
      console.log(`IPv6: ${modules}`);
   }
 
   // `${enabled}` === `${modules}` || (await httpAPI("/v1/modules", "POST", { ipv6: `${modules}` }));
})().finally(() => $done());

function httpAPI(path, method = "GET", body = null) {
   return new Promise((resolve) => {
      $httpAPI(method, path, body, (result) => {
         resolve(result);
      });
   });
}

function rule() {
   let array = $argument.split(",");
   let _ssid = $network.wifi.ssid;
   
   console.log(`Arguments: ${array.join(', ')}`);
   console.log(`Current SSID: ${_ssid}`);
   // 检查是否有任何带 "!" 的规则
   let hasNegativeRule = array.filter(item => item.startsWith('!'));
   console.log(`Has negative rule: ${hasNegativeRule}`);
   function r(s) {
      console.log(`Checking rule for: ${s}`);
      if (hasNegativeRule.length > 0 && s !== "wifi" && s !== "fwo") {
         for (var item of hasNegativeRule) {
         // 如果有带 "!" 的规则
            if (item === `!${s}`) {
            let result = false;
            console.log(`Negative rule logic applied. Result: ${result}`);
            return result;
            }
         }
         console.log("No negative rule matched. Returning true.");
         return true;
      }
      if (s === "wifi" && array.includes("wifi")) {
         console.log("General WiFi rule applied");
         return true;
      }
      let result = array.includes(s);
      console.log(`Rule logic applied. Result: ${result}`);
      return result;
   }
   let final_result;
   if (_ssid === null) {
      final_result = r("fwo");
   } else {
      final_result = r("wifi") || r(_ssid);
   }
   console.log(`Final result: ${final_result}`);
   return final_result;
}

function Net(){
let ip = $network.v6.primaryAddress;
return ip === null ? false 
: !ip.includes('fe80:')
}
