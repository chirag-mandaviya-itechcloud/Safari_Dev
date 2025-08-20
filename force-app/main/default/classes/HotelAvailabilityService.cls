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
            Map<String, Account> hotelNameToAccountMap = new Map<String, Account>();
            Map<String, Account> crmCodeToAccountMap = new Map<String, Account>();
            Set<String> crmCodeSet = new Set<String>();
            Map<String, HotelWrapper> crmCodeToHotelWrapperMap = new Map<String, HotelWrapper>();
            List<HotelWrapper> hotelList = new List<HotelWrapper>();
            HotelRequestWrapper requestWrapper = new HotelRequestWrapper();
            requestWrapper.records = new List<Record>();

            for (Account acc : [SELECT Id, Name, CRM_Code__c FROM Account WHERE RecordType.Name = 'Supplier' and Name = :req.hotelNames]) {
                hotelNameToAccountMap.put(acc.Name.toLowerCase(), acc);
                crmCodeSet.add(acc.CRM_Code__c);
            }

           // for (Account acc : [SELECT Id, Name, CRM_Code__c FROM Account WHERE RecordType.Name = 'Supplier' and Name = :req.hotelNames]) {
            for (Opt__c opt : [SELECT Id, Location__c, Service__c, Supplier__c, Code__c, CRM_Code__c FROM Opt__c WHERE
                               CRM_Code__c =:crmCodeSet AND Service__c = 'AC']) {
                                // String.join(opt.Location__c,opt.Service__c, opt.CRM_Code__c,opt.code__c)

                Record rec = new Record();
                rec.Opt = String.join(new List<String>{opt.Location__c,opt.Service__c, opt.CRM_Code__c,opt.code__c}, '');
                rec.DateFrom = req.startDate;
                rec.DateTo = req.endDate;
                rec.ButtonName = 'Accommodation';
                rec.MaximumOptions = 20;
                rec.Info = 'GIAME';

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

            for (String hotelName : req.hotelNames) {
                Boolean matched = false;
                Account matchedAccount;
				if(hotelList.size() > 5) break;
                if (hotelNameToAccountMap.containsKey(hotelName.toLowerCase()))
                {
                    matchedAccount = hotelNameToAccountMap.get(hotelName.toLowerCase());
                    HotelWrapper hw = new HotelWrapper();

                    // call the api for check availability
                    // Http http = new Http();
                    // HttpRequest httpRequest = new HttpRequest();

                    // httpRequest.setEndpoint('https://api.example.com/checkAvailability');
                    // httpRequest.setMethod('POST');
                    // httpRequest.setHeader('Content-Type', 'application/json');
                    // httpRequest.setBody(JSON.serialize(new Map<String, Object>{
                    //     'Opt' => hotelName,
                    //     'DateFrom' => req.startDate,
                    //     'Info' => req.endDate,
                    //     'SCUqty' => req.numberOfPersons,
                    //     'ButtonName' => 'Accommodation'
                    // }));

                    // HttpResponse res = http.send(httpRequest);
                    // if (res.getStatusCode() == 200) {
                    //     Map<String, Object> responseMap = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
                    //     hw.availability = (String) responseMap.get('availability');
                    // } else {
                    //     hw.availability = 'Error';
                    // }

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
                    crmCodeToHotelWrapperMap.put(matchedAccount.CRM_Code__c, hw);
                } else {
                    availabilityMsg += 'Hotel: ' + hotelName + ' - Skipped (no match)\n';
                }
            }


            for (Opt__c opt : [SELECT Id, CRM_Code__c, Location__c, Service__c, Supplier__c, Code__c FROM Opt__c WHERE CRM_Code__c IN :crmCodeSet]) {

            }

            if (!hotelList.isEmpty()) {
                // Serialize hotel list to JSON
                String hotelJson = JSON.serialize(hotelList);

                // Fire Platform Event once
                Hotel_Availability_Event__e evt = new Hotel_Availability_Event__e(
                    Hotel_JSON__c = hotelJson +'===='+JSON.serialize(requestWrapper)
                );
                EventBus.publish(evt);
            }

            Response res = new Response();
            res.availabilityMessage = availabilityMsg;
            results.add(res);
        }

        return results;
    }
}
