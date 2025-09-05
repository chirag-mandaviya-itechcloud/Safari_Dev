public with sharing class AvailabilitySearchController {

    public class roomConfig {
        @AuraEnabled public Integer Children;
        @AuraEnabled public Integer Adults;
    } 

    public class AvailabilityRequest {
        @AuraEnabled public String Opt;
        @AuraEnabled public String Info;
        @AuraEnabled public String DateFrom;
        @AuraEnabled public String SCUqty;
        @AuraEnabled public String ButtonName;
        @AuraEnabled public List<roomConfig> RoomConfigs;
        @AuraEnabled public Integer MaximumOptions;
    }

    public class AvailabilityWrapper {
        @AuraEnabled public List<AvailabilityRequest> records;
    }

    @AuraEnabled
    public static String getOptions(String reqPayload) {
        // Wrap inside "records" array
        // AvailabilityWrapper wrapper = new AvailabilityWrapper();
        // wrapper.records = new List<AvailabilityRequest>{ filters };

        // system.debug('filters-----' + filters);

        // Convert to JSON
        System.debug('reqPayload==>'+ reqPayload);
        String payload = JSON.serialize(reqPayload);
        System.debug('Payload => ' + payload);

        HttpRequest req = new HttpRequest();
        req.setEndpoint('https://rest.synatic.com/roamdev/tourplanapi/get_opts'); 
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setBody(reqPayload);
        req.setTimeout(120000);

        Http http = new Http();
        HTTPResponse res = http.send(req);

        Integer sc = res.getStatusCode();
        if (sc >= 200 && sc < 300) {
            return res.getBody();
        }
        throw new AuraHandledException('Tourplan call failed: ' + sc + ' ' + res.getStatus());
    }

    @AuraEnabled
    public static List<Account> getSupplier(String supplierName) {
        String pattern = '%' + supplierName + '%';
        List<Account> suppliers = [SELECT Id, Name, CRM_Code__c FROM Account WHERE RecordType.Name = 'Supplier' and Name LIKE :pattern LIMIT 1];

        return suppliers;
    }

    @AuraEnabled
    public static List<Opt__c> getOpts(String locationName) {
        String pattern = '%' + locationName + '%';
        List<Opt__c> opts = [SELECT Location__c FROM Opt__c WHERE LOC_Name__c LIKE :pattern LIMIT 1];
        return opts;
    }

    public class LocationOption {
        @AuraEnabled public String label;
        @AuraEnabled public String value;
    }

    @AuraEnabled
    public static List<LocationOption> getLocationOptions() {
        List<LocationOption> out = new List<LocationOption>();

        for (Location__c l : [SELECT Id, Destination_Text__c FROM Location__c WHERE Is_Parent__c = true]) {
            LocationOption o = new LocationOption();
            o.label = l.Destination_Text__c;
            o.value = l.Id;
            out.add(o);
        }
        return out;
    }

    @AuraEnabled
    public static List<Location__c> getSelectedLocationsWithCodes(List<Id> locationIds) {
        return [SELECT Id, LOC_Name__c, Tour_Plan_Location_Name__c FROM Location__c WHERE Location__c = :locationIds];
    }

    @AuraEnabled
    public static List<LocationOption> getHotelsFromLocations(List<Id> locationIds) {
        List<LocationOption> out = new List<LocationOption>();
        for (Account acc: [SELECT Id, Name, CRM_Code__c, TP_Location__c, TP_Location_Code__c, Location__c FROM Account  WHERE RecordType.Name = 'Supplier' AND CRM_Code__c != null]) {
            LocationOption o = new LocationOption();
            o.label = acc.Name;
            o.value = acc.CRM_Code__c;
            out.add(o);
        }
        return out;
    }
}