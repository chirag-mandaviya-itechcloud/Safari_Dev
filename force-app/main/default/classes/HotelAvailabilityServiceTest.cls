@isTest
public class HotelAvailabilityServiceTest {
    private class MockHttpResponseGenerator implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setHeader('Content-Type', 'application/json');
            res.setBody('{"mockKey":"mockValue"}');
            res.setStatusCode(200);
            return res;
        }
    }

    @TestSetup
    static void setupData() {
        Account acc1 = new Account(
            Name = 'Test Supplier',
            RecordTypeId = Schema.SObjectType.Account.getRecordTypeInfosByName().get('Supplier').getRecordTypeId(),
            CRM_Code__c = 'CRM123',
            TP_Location__c = 'TP1',
            TP_Location_Code__c = 'TPCODE1'
        );
        insert acc1;
        Quote q = new Quote(
            Name = 'Test Quote',
            TravelStartDate__c = Date.today(),
            TravelEndDate__c = Date.today().addDays(5),
            Quotation_Name__c = 'Destination Name'
        );
        insert q;                                                                   
    }

    @isTest
    static void testCheckHotelAvailability() {
        Test.setMock(HttpCalloutMock.class, new MockHttpResponseGenerator());

        Quote q = [SELECT Id FROM Quote WHERE Name = 'Test Quote' LIMIT 1];

        HotelAvailabilityService.Request req = new HotelAvailabilityService.Request();
        req.hotelNames = new List<String>{'Test Supplier'};
        req.startDate = Date.today();
        req.endDate = Date.today().addDays(5);
        req.numberOfPersons = 2;
        req.numberOfChildren = 1;
        req.quoteId = q.Id;

        Test.startTest();
        List<HotelAvailabilityService.Response> responses = HotelAvailabilityService.checkHotelAvailability(new List<HotelAvailabilityService.Request>{ req });
        Test.stopTest();

        System.assertEquals(1, responses.size());
        System.assert(responses[0].availabilityMessage.contains('Results'));
        System.assert(responses[0].availabilityMessage.contains('Request'));
        System.assert(responses[0].availabilityMessage.contains('Response'));

    }
}