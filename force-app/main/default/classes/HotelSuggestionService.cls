public with sharing class HotelSuggestionService {
    
    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> suggestHotels(String addressInput) {
        
        // Use LIKE for fuzzy matching
        List<CRM__c> crmRecords = [
            SELECT Id, Name, CODE__c, ADDRESS1__c, ADDRESS2__c, ADDRESS3__c, ADDRESS4__c, ADDRESS5__c
            FROM CRM__c
            WHERE ADDRESS1__c LIKE :('%' + addressInput + '%')
               OR ADDRESS2__c LIKE :('%' + addressInput + '%')
               OR ADDRESS3__c LIKE :('%' + addressInput + '%')
               OR ADDRESS4__c LIKE :('%' + addressInput + '%')
               OR ADDRESS5__c LIKE :('%' + addressInput + '%')
        ];
        
        List<String> codes = new List<String>();
        Map<String, CRM__c> codeToCRMMap = new Map<String, CRM__c>();
        
        for (CRM__c record : crmRecords) {
            if (record.CODE__c != null) {
                codes.add(record.CODE__c);
                codeToCRMMap.put(record.CODE__c, record);
            }
        }
        
        if (codes.isEmpty()) {
            return new List<Map<String, String>>();
        }
        
        List<Account> accounts = [
            SELECT Id, Name, CRM_Code__c
            FROM Account
            WHERE CRM_Code__c IN :codes
        ];
        
        List<Map<String, String>> results = new List<Map<String, String>>();
        
        for (Account acc : accounts) {
            CRM__c crm = codeToCRMMap.get(acc.CRM_Code__c);
            
            String fullAddress = String.join(new List<String>{
                crm.ADDRESS1__c, crm.ADDRESS2__c, crm.ADDRESS3__c, crm.ADDRESS4__c, crm.ADDRESS5__c
            }, ', ');
            
            Map<String, String> hotelInfo = new Map<String, String>();
            hotelInfo.put('AccountName', acc.Name);
            hotelInfo.put('Address', fullAddress);
            
            results.add(hotelInfo);
        }
        
        return results;
    }
}