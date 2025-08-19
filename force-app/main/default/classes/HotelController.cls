public class HotelController {
    
    @AuraEnabled(cacheable=true)
    public static List<Opt__c> getOptsByCrmCode(String crmCode) {
        return [SELECT Id, Name, Description__c, ExternalId__c, Comment__c, LOC_Name__c, CRM_Lookup__c, SRV_Name__c FROM Opt__c WHERE CRM_Code__c = :crmCode];
    }
    
    @AuraEnabled(cacheable=true)
    public static Map<String, Integer> getPassengerTypeCounts(Id quoteId) {
        List<PassengerQuotationMapping__c> records = [
            SELECT Passenger_Type__c 
            FROM PassengerQuotationMapping__c 
            WHERE Quote__c = :quoteId
        ];
        
        Map<String, Integer> counts = new Map<String, Integer>{
            'Adult' => 0,
                'Child' => 0,
                'Infant' => 0
                };
                    
                    for (PassengerQuotationMapping__c rec : records) {
                        if (counts.containsKey(rec.Passenger_Type__c)) {
                            counts.put(rec.Passenger_Type__c, counts.get(rec.Passenger_Type__c) + 1);
                        }
                    }
        
        return counts;
    }
    
    public class Request {
        @InvocableVariable(required=true)
        public String city;
    }
    
    @InvocableMethod(label='Get Hotels from Accounts and CRM')
    public static List<HotelWrapper> getHotelsDetails(List<Request> requests) {
        List<HotelWrapper> results = new List<HotelWrapper>();
        Map<String, String> mapOfCRMToAccount = new Map<String, String>();
        List<Account> accounts = [SELECT Id, name, RecordType.name, CRM_Code__c FROM Account where RecordType.name='Supplier'];
        for (Account acc : accounts) {
            mapOfCRMToAccount.put(acc.CRM_Code__c, acc.name);
        }

        String cityPattern = '%' + requests[0].city + '%';
        
        List<CRM__c> crms = [SELECT Id, Name, CODE__c, ADDRESS1__c, ADDRESS2__c, ADDRESS3__c, ADDRESS4__c, ADDRESS5__c FROM CRM__c WHERE CODE__c IN: mapOfCRMToAccount.keySet()
                             AND(ADDRESS1__c LIKE :cityPattern OR ADDRESS2__c LIKE :cityPattern OR ADDRESS3__c LIKE :cityPattern OR ADDRESS4__c LIKE :cityPattern OR ADDRESS5__c LIKE :cityPattern)];
        if (crms.size() > 0) {
            for (CRM__c crm: crms) {
                HotelWrapper htl = new HotelWrapper();
                htl.hotelName = mapOfCRMToAccount.get(crm.CODE__c);
                htl.address = crm.ADDRESS1__c + ',' + crm.ADDRESS2__c + ',' + crm.ADDRESS3__c + ',' + crm.ADDRESS4__c + ',' + crm.ADDRESS5__c;
                htl.crmCode = crm.CODE__c;
                results.add(htl);
            }    
        }
        else {
            return null;
        }
        return results;
    }
    
    public class HotelWrapper {
        @InvocableVariable public String hotelName;
        @InvocableVariable public String address;
        @InvocableVariable public String crmCode;
    }
    
    
    
    
}