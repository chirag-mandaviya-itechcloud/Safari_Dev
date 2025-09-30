@isTest
public class AvailabilitySearchControllerTest {
	private class MockHttpResponseGenerator implements HttpCalloutMock {
        public HTTPResponse respond(HTTPRequest req) {
            HttpResponse res = new HttpResponse();
            res.setHeader('Content-Type', 'application/json');
            res.setBody('{"status":"success","data":"mocked"}');
            res.setStatusCode(200);
            return res;
        }
    }
    
    @testSetup
    static void setupData() {

        Profile profile = [SELECT Id FROM Profile WHERE Id = :UserInfo.getProfileId()];
        User user = new User(
            FirstName = 'Test',
            LastName = 'User',
            Email = 'testuser@example.com',
            Username = 'testuser' + DateTime.now().getTime() + '@example.com',
            Alias = 'tuser',
            TimeZoneSidKey = 'GMT',
            LocaleSidKey = 'en_US',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'en_US',
            ProfileId = profile.Id
        );
        insert user;

        System.runAs(user) {
            user.ByPassValidation__c = true;
            update user;
            Location__c ferretLocation = new Location__c(
                Name = 'FerretDestination',
                Destination_Text__c = 'Ferret Destination',
                LOC_Name__c = 'FerretLocName',
                Tour_Plan_Location_Name__c = 'TPLocFerret',
                Is_Parent__c = true
            );
            insert ferretLocation;
            
            Location__c childLocation = new Location__c(
                Name = 'ChildLoc',
                Destination_Text__c = 'Child Destination',
                LOC_Name__c = 'ChildLocName',
                Tour_Plan_Location_Name__c = 'TPLocChild',
                Is_Parent__c = false,
                Location__c = ferretLocation.Id
            );
            insert childLocation;

            Account account1 = new Account(
                Name = 'Test Supplier',
                RecordTypeId = Schema.SObjectType.Account.getRecordTypeInfosByName().get('Supplier').getRecordTypeId(),
                CRM_Code__c = 'CRM123',
                TP_Location__c = 'TP1',
                TP_Location_Code__c = 'TPCODE1',
                Country_of_Residence__c = 'South Africa',
                Location__c = childLocation.Id
            );
            insert account1;

            Account account2 = new Account(
                Name = 'Hotel A',
                RecordTypeId = Schema.SObjectType.Account.getRecordTypeInfosByName().get('Supplier').getRecordTypeId(),
                CRM_Code__c = 'CRM456',
                TP_Location__c = 'TP2',
                TP_Location_Code__c = 'TPCODE1',
                Country_of_Residence__c = 'South Africa',
                Location__c = childLocation.Id
            );
            insert account2;

            Opportunity opportunity = new Opportunity(
                Name = 'Opp1',
                StageName = 'Prospecting',
                CloseDate = Date.today(),
                Client_Display_Currency__c = 'USD',
                AccountId = account1.Id

            );
            insert opportunity;
            
            Quote quote = new Quote(
                Name = 'Test Quote',
                TravelStartDate__c = Date.today(),
                TravelEndDate__c = Date.today().addDays(5),
                Quotation_Name__c = 'Destination Name',
                OpportunityId = opportunity.Id
            );
            insert quote;

            LCL__c lcl = new LCL__c(
                DESCR__c = 'Test Place'
            );
            insert lcl;

            Opt__c opt1 = new Opt__c(
                Service__c = 'AC',
                Supplier__c = 'CRM456',
                Code__c = 'STANBB',
                ExternalId__c = 'CPTACCRM456STANBB',
                Opt_Id__c = 10,
                LCL_Lookup__c = lcl.Id
            );
            insert opt1;

            ExchangeRates__c exc =  new ExchangeRates__c(
                BaseCurrency__c = 'USD',
                USD__c = 1,
                EUR__c = 0.9,
                ZAR__c = 18,
                ExchangeRateDate__c = Date.today()
            );
            insert exc;
        }
    }

    @isTest
    static void testGetOptions() {
        Test.setMock(HttpCalloutMock.class, new MockHttpResponseGenerator());

        String reqPayload = '{"records":[{"Opt":"OPT1","Info":"Test"}]}';
        Test.startTest();
        String result = AvailabilitySearchController.getOptions(reqPayload);
        Test.stopTest();

        System.assertNotEquals(null, result);
        System.assert(result.contains('mocked'));
    }

    @isTest
    static void testGetSupplier() {
        List<Account> suppliers = AvailabilitySearchController.getSupplier('Test Supplier');
        System.assertEquals(1, suppliers.size());
        System.assertEquals('CRM123', suppliers[0].CRM_Code__c);
    }

    @isTest
    static void testGetOpts() {
        List<Opt__c> opts = AvailabilitySearchController.getOpts('Test Place');
        System.assertEquals(1, opts.size());
    }

    @isTest
    static void testGetLocationOptions() {
        List<AvailabilitySearchController.LocationOption> locOptions = AvailabilitySearchController.getLocationOptions();
        System.assert(locOptions.size() > 0);
        System.assertEquals('Ferret Destination', locOptions[0].label);
    }

    @IsTest
    static void testGetSelectedLocationsWithCodes() {
        Id locId = [SELECT Id FROM Location__c WHERE Name = 'FerretDestination' LIMIT 1].Id;

        List<Location__c> locs = AvailabilitySearchController.getSelectedLocationsWithCodes(new List<Id>{locId});
        System.assertEquals(1, locs.size());
        System.assertEquals('TPLocChild' , locs[0].Tour_Plan_Location_Name__c);
    }

    @isTest
    static void testGetHotelsFromLocations() {
        Id locId = [SELECT Id FROM Location__c WHERE Name = 'ChildLoc' LIMIT 1].Id;

        List<AvailabilitySearchController.LocationOption> locations = AvailabilitySearchController.getHotelsFromLocations(new List<Id>{locId});
        System.assert(locations.size() > 0);
        System.assertEquals('Test Supplier', locations[0].label);
    }

    @isTest
    static void testGetTravelDatesFromQuote() {
        Id quoteId = [SELECT Id FROM Quote WHERE Name = 'Test Quote' LIMIT 1].Id;

        AvailabilitySearchController.TravelDatesWrapper dates = AvailabilitySearchController.getTravelDatesFromQuote(quoteId);
        System.assertEquals(Date.today(), dates.startDate);
    }

    @isTest
    static void testGetFerretDestinationFromCrmCode() {
        Map<String, String> destMap = AvailabilitySearchController.getFerretDestinationFromCrmCode();
        System.assert(destMap.containsKey('CRM123'));
        System.assertEquals('Child Destination', destMap.get('CRM123'));
    }

    @isTest
    static void testGetOptsExternalIds() {
        List<String> extIds = AvailabilitySearchController.getOptsExternalIds();
        System.assert(extIds.contains('CPTACCRM456STANBB'));
    }

    @isTest
    static void testGetAllCurrencyMapByBaseCurrency() {
        Map<String, ExchangeRates__c> excMap = AvailabilitySearchController.getAllCurrencyMapByBaseCurrency();
        System.assert(excMap.containsKey('USD'));
    }

    @isTest
    static void testGetQuoteDetails() {
        Quote q = [SELECT Id FROM Quote LIMIT 1];
        Quote res = AvailabilitySearchController.getQuoteDetails(q.Id);
        System.assertEquals('USD', res.Opportunity.Client_Display_Currency__c);
    }

    @isTest
    static void testGetCountryMarkups() {
        Map<String, Decimal> countryMap = AvailabilitySearchController.getCountryMarkups();
        System.assert(countryMap.containsKey('South Africa'));
    }

    @isTest
    static void testGetServiceTypeMarkups() {
        Map<String, Decimal> countryMap = AvailabilitySearchController.getServiceTypeMarkups();
        System.assert(countryMap.containsKey('Accommodation'));
    }

    @isTest
    static void testGetSupplierMarkups() {
        Map<String, Decimal> countryMap = AvailabilitySearchController.getSupplierMarkups();
        System.assert(countryMap.containsKey('AMA004'));
    }

    @isTest
    static void testGetSupplierNamesByCrmCodes() {
        String crmCode = [SELECT Id, CRM_Code__c FROM Account LIMIT 1].CRM_Code__c;
        Map<String, String> hotelMap = AvailabilitySearchController.getSupplierNamesByCrmCodes(new List<String> {crmCode});
        System.assert(hotelMap.containsKey(crmCode));
    }
}