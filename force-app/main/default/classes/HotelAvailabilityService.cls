public with sharing class HotelAvailabilityService {

    public class Request {
        @InvocableVariable(required=true)
        public List<String> hotelNames;

        @InvocableVariable(required=true)
        public Date startDate;

        @InvocableVariable(required=true)
        public Date endDate;

        @InvocableVariable(required=true)
        public Integer numberOfPersons;

        @InvocableVariable(required=true)
        public Integer numberOfChildren;

        @InvocableVariable(required=true)
        public Id quoteId;
    }

    public class Response {
        @InvocableVariable
        public String availabilityMessage;
    }

    public class HotelAvailabilityResult {
        public String hotelName;
        public String availability;
        public Decimal totalPrice;
        public String currencyName;
        public String rateText;
    }

    public class HotelWrapper {
        public String hotelName;
        public Date startDate;
        public Date endDate;
        public Integer numberOfPersons;
        public Integer numberOfChildren;
        public String availability;
        public Id accountId;
        public String crmCode;
        public Id quoteId;
        public List<HotelAvailabilityResult> availabilityResults;
    }

    public class HotelRequestWrapper{
        public List<Record> records;
    }

    public class Record {
        public String Opt;
        public Date DateFrom;
        public Date DateTo;
        public String Info;
        public String ButtonName;
        public Integer MaximumOptions;
        public List<RoomConfigWrapper> RoomConfigs;
    }

    public class RoomConfigWrapper {
        public RoomConfig RoomConfig;
    }

    public class RoomConfig {
        public Integer Adults;
        public Integer Children;
        public String RoomType;
    }

    @InvocableMethod(label='Check Hotels Availability & Fire Single Event')
    public static List<Response> checkHotelAvailability(List<Request> requests) {
        /*List<Response> results = new List<Response>();

// ✅ Query all hotel Accounts with RecordType 'Supplier'
Map<String, Account> hotelNameToAccountMap = new Map<String, Account>();
for (Account acc : [SELECT Id, Name, CRM_Code__c FROM Account WHERE RecordType.Name = 'Supplier']) {
hotelNameToAccountMap.put(acc.Name.toLowerCase(), acc);
}

for (Request req : requests) {
List<HotelWrapper> hotelList = new List<HotelWrapper>();
String availabilityMsg = 'Results:\n';

for (String hotelName : req.hotelNames) {
Boolean matched = false;
Account matchedAccount;

for (String accName : hotelNameToAccountMap.keySet()) {
if (hotelName.toLowerCase().contains(accName)) {
matched = true;
matchedAccount = hotelNameToAccountMap.get(accName);
break;
}
}

if (matched) {
HotelWrapper hw = new HotelWrapper();
hw.hotelName = hotelName;
hw.startDate = req.startDate;
hw.endDate = req.endDate;
hw.numberOfPersons = req.numberOfPersons;
hw.numberOfChildren = req.numberOfChildren;
hw.availability = 'Available'; // Hardcoded for now
hw.accountId = matchedAccount.Id;
hw.crmCode = matchedAccount.CRM_Code__c;
hw.quoteId = req.quoteId;

hotelList.add(hw);
availabilityMsg += 'Hotel: ' + hotelName + ' (AccountId: ' + matchedAccount.Id + ') - Available\n';
} else {
availabilityMsg += 'Hotel: ' + hotelName + ' - Skipped (no match)\n';
}
}

if (!hotelList.isEmpty()) {
// Serialize hotel list to JSON
String hotelJson = JSON.serialize(hotelList);

// Fire Platform Event once
Hotel_Availability_Event__e evt = new Hotel_Availability_Event__e(
Hotel_JSON__c = hotelJson
);
EventBus.publish(evt);
}

Response res = new Response();
res.availabilityMessage = availabilityMsg;
results.add(res);
}

return results;*/

        List<Response> results = new List<Response>();
        for (Request req : requests) {
            // Map<String, Account> hotelNameToAccountMap = new Map<String, Account>();
            Map<String, Account> crmCodeToAccountMap = new Map<String, Account>();
            Set<String> crmCodeSet = new Set<String>();
            Map<String, String> OptCodeToCrmCode = new Map<String, String>();
            Map<String, HotelWrapper> hotelNameToHotelWrapperMap = new Map<String, HotelWrapper>();
            List<HotelWrapper> hotelList = new List<HotelWrapper>();
            HotelRequestWrapper requestWrapper = new HotelRequestWrapper();
            Map<String, HotelWrapper> hotelData = new Map<String, HotelWrapper>();
            requestWrapper.records = new List<Record>();

            System.debug('Request: ' + JSON.serialize(req));

            for (Account acc : [SELECT Id, Name, CRM_Code__c FROM Account WHERE RecordType.Name = 'Supplier' and Name = :req.hotelNames]) {
                // hotelNameToAccountMap.put(acc.Name.toLowerCase(), acc);
                crmCodeToAccountMap.put(acc.CRM_Code__c, acc);
                crmCodeSet.add(acc.CRM_Code__c);
            }
            System.debug('CRM Codes: ' + crmCodeSet);

            // for (Account acc : [SELECT Id, Name, CRM_Code__c FROM Account WHERE RecordType.Name = 'Supplier' and Name = :req.hotelNames]) {
            for (Opt__c opt : [SELECT Id, Location__c, Service__c, Supplier__c, Code__c, CRM_Code__c FROM Opt__c WHERE
                               CRM_Code__c =:crmCodeSet AND Service__c = 'AC']) {
                                   // String.join(opt.Location__c,opt.Service__c, opt.CRM_Code__c,opt.code__c)

                                   Record rec = new Record();
                                   String optCode = String.join(new List<String>{opt.Location__c,opt.Service__c,opt.Supplier__c,opt.Code__c}, '');
                                   rec.Opt = optCode;
                                   OptCodeToCrmCode.put(optCode, opt.CRM_Code__c);
                                   rec.DateFrom = req.startDate;
                                   rec.DateTo = req.endDate;
                                   rec.ButtonName = 'Accommodation';
                                   rec.MaximumOptions = 20;
                                   rec.Info = 'GSI';

                                   // Add RoomConfig
                                   rec.RoomConfigs = new List<RoomConfigWrapper>();
                                   RoomConfigWrapper rcw = new RoomConfigWrapper();
                                   rcw.RoomConfig = new RoomConfig();
                                   rcw.RoomConfig.Adults = req.numberOfPersons != null ? req.numberOfPersons : 2;
                                   rcw.RoomConfig.Children = req.numberOfChildren != null ? req.numberOfChildren : 0;
                                   rcw.RoomConfig.RoomType = 'TW'; // Example, adjust if dynamic
                                   rec.RoomConfigs.add(rcw);

                                   // Add to final request list
                                   requestWrapper.records.add(rec);
                               }

            system.debug('Request Wrapper: ' + JSON.serialize(requestWrapper));

            String availabilityMsg = 'Results:\n';

            // call the api for check availability
            Http http = new Http();
            HttpRequest httpRequest = new HttpRequest();

            httpRequest.setEndpoint('https://rest.synatic.com/roamdev/tourplanapi/get_opts');
            httpRequest.setMethod('POST');
            httpRequest.setHeader('Content-Type', 'application/json');
            httpRequest.setBody(JSON.serialize(requestWrapper));
            httpRequest.setTimeout(120000); // Set timeout to 120 seconds
            System.debug('Body: ' + JSON.serialize(requestWrapper));

            HttpResponse res = http.send(httpRequest);
            System.debug('Status: ' + res.getStatusCode());
            System.debug('Response: ' + res.getBody());
            if (res.getStatusCode() == 200) {
                Map<String, Object> responseMap = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
                // hw.availability = (String) responseMap.get('availability');

                List<Object> resultsList = (List<Object>) responseMap.get('result');

                System.debug('resultsList: ' + resultsList);

                for (Object result : resultsList) {
                    if (result == null) continue;
                    Map<String, Object> resultMap = (Map<String, Object>) result;
                    String crmCode = OptCodeToCrmCode.get((String) resultMap.get('Opt'));
                    String supplierName = '';
                    if (resultMap.containsKey('OptGeneral')) {
                        Map<String, Object> optGeneral = (Map<String, Object>) resultMap.get('OptGeneral');
                        supplierName = (String) optGeneral.get('SupplierName');
                        System.debug('SupplierName: ' + supplierName);

                    }

                    Object optStayRaw = resultMap.get('OptStayResults');
                    List<Object> optStayResults = new List<Object>();
                    if (optStayRaw instanceof List<Object>) {
                        // Already a list → cast directly
                        optStayResults = (List<Object>) optStayRaw;
                    } else if (optStayRaw instanceof Map<String, Object>) {
                        // Single object → wrap in a list
                        optStayResults.add((Map<String, Object>) optStayRaw);
                    }

                    HotelWrapper hw = new HotelWrapper();

                    if (hotelData.containsKey(crmCode)) {
                        hw = hotelData.get(crmCode);
                    } else {
                        hw.hotelName = supplierName;
                        hw.startDate = req.startDate;
                        hw.endDate = req.endDate;
                        hw.numberOfPersons = req.numberOfPersons;
                        hw.numberOfChildren = req.numberOfChildren;
                        hw.availability = 'Available'; // Hardcoded for now
                        hw.accountId = crmCodeToAccountMap.get(crmCode).Id;
                        hw.crmCode = crmCode;
                        hw.quoteId = req.quoteId;
                        hw.availabilityResults = new List<HotelAvailabilityResult>();
                    }

                    for (Object osr : optStayResults) {
                        Map<String, Object> stayResultMap = (Map<String, Object>) osr;
                        if (stayResultMap.get('Availability') == 'NO') continue;
                        HotelAvailabilityResult har = new HotelAvailabilityResult();
                        har.hotelName = supplierName;
                        har.availability = (String) stayResultMap.get('Availability');
                        har.currencyName = (String) stayResultMap.get('Currency');
                        har.totalPrice = stayResultMap.containsKey('TotalPrice') && stayResultMap.get('TotalPrice') != null
                            ? Decimal.valueOf(String.valueOf(stayResultMap.get('TotalPrice')))
                            : 0;
                        har.rateText = stayResultMap.get('RateText') != null ? (String) stayResultMap.get('RateText') : '';
                        hw.availabilityResults.add(har);
                    }
                    if (hw.availabilityResults.isEmpty()) {
                        hw.availability = 'Not Available';
                    } else {
                        hw.availability = 'Available';
                    }

                    hotelData.put(crmCode, hw);
                    availabilityMsg += 'Hotel: ' + supplierName + ' (AccountId: ' + hw.accountId + ') - Available\n';
                }

                for ( String keyCrm : crmCodeToAccountMap.keySet() ) {
                    if (!hotelData.containsKey(keyCrm)) {
                        HotelWrapper hw = new HotelWrapper();
                        hw.hotelName = crmCodeToAccountMap.get(keyCrm).Name;
                        hw.startDate = req.startDate;
                        hw.endDate = req.endDate;
                        hw.numberOfPersons = req.numberOfPersons;
                        hw.numberOfChildren = req.numberOfChildren;
                        hw.availability = 'Not Available';
                        hw.accountId = crmCodeToAccountMap.get(keyCrm).Id;
                        hw.crmCode = keyCrm;
                        hw.quoteId = req.quoteId;

                        hotelData.put(keyCrm, hw);
                    }
                }

                System.debug('hotelData: ' + hotelData);
            } else {
                availabilityMsg += 'Error from API: ' + res.getStatusCode() + ' - ' + res.getBody() + '\n';
            }


            // for (Object result : resultsList) {
            //     Map<String, Object> resultMap = (Map<String, Object>) JSON.deserializeUntyped(result);

            // }



            //     hw.hotelName = hotelName;
            //     hw.startDate = req.startDate;
            //     hw.endDate = req.endDate;
            //     hw.numberOfPersons = req.numberOfPersons;
            //     hw.numberOfChildren = req.numberOfChildren;
            //     hw.availability = 'Available'; // Hardcoded for now
            //     hw.accountId = matchedAccount.Id;
            //     hw.crmCode = matchedAccount.CRM_Code__c;
            //     hw.quoteId = req.quoteId;

            //     hotelList.add(hw);
            //     availabilityMsg += 'Hotel: ' + hotelName + ' (AccountId: ' + matchedAccount.Id + ') - Available\n';
            //     crmCodeToHotelWrapperMap.put(matchedAccount.CRM_Code__c, hw);
            // } else {
            //     availabilityMsg += 'Hotel: ' + hotelName + ' - Skipped (no match)\n';
            // }

           if (!hotelData.isEmpty()) {
                // Serialize hotel list to JSON
                String hotelJson = JSON.serialize(hotelData);
                System.debug('Serialized Hotel JSON: ' + hotelJson);

                // Fire Platform Event once
                Hotel_Availability_Event__e evt = new Hotel_Availability_Event__e(
                    Hotel_JSON__c = hotelJson
                );
                EventBus.publish(evt);
            }

            Response resp = new Response();
            resp.availabilityMessage = availabilityMsg;
            results.add(resp);
        }

        return results;
    }
}
