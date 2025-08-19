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
            for (Account acc : [SELECT Id, Name, CRM_Code__c FROM Account WHERE RecordType.Name = 'Supplier' and Name = :req.hotelNames]) {
                hotelNameToAccountMap.put(acc.Name.toLowerCase(), acc);
            }

            List<HotelWrapper> hotelList = new List<HotelWrapper>();
            String availabilityMsg = 'Results:\n';
			
            for (String hotelName : req.hotelNames) {
                Boolean matched = false;
                Account matchedAccount;
				if(hotelList.size() > 5) break;
                if (hotelNameToAccountMap.containsKey(hotelName.toLowerCase())) 
                {
                    matchedAccount = hotelNameToAccountMap.get(hotelName.toLowerCase());
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

        return results;
    }
}