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
        Tourplan_Synatic_Configuration__mdt config = [SELECT Id, DeveloperName, Url_Endpoint__c, Api_Key__c FROM Tourplan_Synatic_Configuration__mdt WHERE DeveloperName = 'Synatic_Tourplan_API' LIMIT 1];
        String endpoint = config.Url_Endpoint__c;
        String apiKey = config.Api_Key__c;
        String payload = JSON.serialize(reqPayload);

        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpoint); 
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('X-API-Key', apiKey);
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
        for (Account acc: [SELECT Id, Name, CRM_Code__c, TP_Location__c, TP_Location_Code__c, Location__c FROM Account  WHERE RecordType.Name = 'Supplier' AND CRM_Code__c != null AND Location__c = :locationIds]) {
            LocationOption o = new LocationOption();
            o.label = acc.Name;
            o.value = acc.CRM_Code__c;
            out.add(o);
        }
        return out;
    }

    public class TravelDatesWrapper {
        @AuraEnabled public Date startDate;
        @AuraEnabled public Decimal durationNights;
    }

    @AuraEnabled
    public static TravelDatesWrapper getTravelDatesFromQuote(Id quoteId) {
        Quote q = [SELECT Id, TravelStartDate__c, Total_Nights__c FROM Quote WHERE Id = :quoteId LIMIT 1];

        TravelDatesWrapper tw = new TravelDatesWrapper();
        tw.startDate = q.TravelStartDate__c;
        tw.durationNights = q.Total_Nights__c;

        return tw;
    }

    @AuraEnabled(cacheable=true)
    public static Map<String, String> getFerretDestinationFromCrmCode() {
        Map<String, String> accToFerretDestinations = new Map<String, String>();
        for (Account acc : [SELECT Id, Ferret_Destination__c, CRM_Code__c FROM Account WHERE CRM_Code__c != null AND RecordType.Name  = 'Supplier']) {
            accToFerretDestinations.put(acc.CRM_Code__c, acc.Ferret_Destination__c);
        }
        return accToFerretDestinations;
    }
    
    @AuraEnabled(cacheable=true)
    public static List<String> getOptsExternalIds() {
        List<String> optCodes = new List<String>();
        
        for (Opt__c op : [SELECT Id, ExternalId__c FROM Opt__c WHERE Service__c = 'AC']) {
            optCodes.add(op.ExternalId__c);
        }
        
        return optCodes;
    }
    
    @AuraEnabled(cacheable=true)
    public static Map<String,ExchangeRates__c> getAllCurrencyMapByBaseCurrency()
    {
        List <ExchangeRates__c> rates = [SELECT        
                                         AED__c,
                                         ANG__c,
                                         ARS__c,
                                         AUD__c,
                                         BaseCurrency__c,
                                         BRL__c,
                                         CAD__c,
                                         CHF__c,
                                         CLP__c,
                                         CNY__c,
                                         DKK__c,
                                         EUR__c,
                                         ExchangeRateDate__c,
                                         GBP__c,
                                         HKD__c,
                                         Id,
                                         ILS__c,
                                         MYR__c,
                                         Name,
                                         NZD__c,
                                         PEN__c,
                                         RUB__c,
                                         SEK__c,
                                         SGD__c,
                                         USD__c,
                                         ZAR__c 
                                         FROM
                                         ExchangeRates__c
                                         WHERE 
                                         BaseCurrency__c IN ('USD','EUR','ZAR') 
                                         ORDER by CreatedDate DESC limit 3];
        
        Map<String,ExchangeRates__c> output = new Map<String,ExchangeRates__c>();
        for(ExchangeRates__c rate : rates){
            if(!output.containsKey(rate.BaseCurrency__c)){
                output.put(rate.BaseCurrency__c,rate);
            }
        }
        
        return output;
        
        
    }

    @AuraEnabled(cacheable=true)
    public static Quote getQuoteDetails(Id quoteId) {
        return [SELECT Opportunity.Client_Display_Currency__c, Opportunity.Country_of_Residence__c FROM Quote WHERE Id = :quoteId LIMIT 1];
    }

    @AuraEnabled(cacheable=true)
    public static Map<String, Decimal> getCountryMarkups() {
        Map<String, Decimal> markups = new Map<String, Decimal>();
        for (CountryOriginMarkup__mdt m : [SELECT MasterLabel, Value__c FROM CountryOriginMarkup__mdt]) {
            markups.put(m.MasterLabel, Decimal.valueOf(String.valueOf(m.Value__c)));
        }
        return markups;
    }

    @AuraEnabled(cacheable=true)
    public static Map<String, Decimal> getServiceTypeMarkups() {
        Map<String, Decimal> markups = new Map<String, Decimal>();
        for (ServiceTypeMarkup__mdt m : [SELECT MasterLabel, Value__c FROM ServiceTypeMarkup__mdt]) {
            markups.put(m.MasterLabel, Decimal.valueOf(String.valueOf(m.Value__c)));
        }
        return markups;
    }

    @AuraEnabled(cacheable=true)
    public static Map<String, Decimal> getSupplierMarkups() {
        Map<String, Decimal> markups = new Map<String, Decimal>();
        for (SupplierMarkup__mdt m : [SELECT Code__c, Value__c FROM SupplierMarkup__mdt]) {
            markups.put(m.Code__c, Decimal.valueOf(String.valueOf(m.Value__c)));
        }
        return markups;
    }

    @AuraEnabled
    public static Map<String, String> getSupplierNamesByCrmCodes(List<String> crmCodes) {
        Map<String, String> out = new Map<String, String>();
        if (crmCodes == null || crmCodes.isEmpty()) return out;
        for (Account a : [SELECT Name, CRM_Code__c FROM Account WHERE CRM_Code__c IN :crmCodes]) {
            out.put(a.CRM_Code__c, a.Name);
        }
        return out;
    }
}