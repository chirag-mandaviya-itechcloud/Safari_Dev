@isTest
public class GetTravelInformationFromQuoteTest {
    @TestSetup
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

            Account account = new Account(
                Name = 'Test Account'
            );
            insert account;

            Opportunity opportunity = new Opportunity(
                Name = 'Test Opp',
                StageName = 'Prospecting',
                CloseDate = Date.today().addDays(30),
                AccountId = account.Id,
                Country_of_Interest__c = 'South Africa',
                Region_of_Interest__c = 'Kruger Safaris',
                Activities_of_Interest__c = 'Go on Safari',
                Level_of_Accommodation__c = 'Luxury',
                Budget_Total_US__c = 10000
            );
            insert opportunity;

            Quote quote = new Quote(
                Name = 'Test Quote',
                OpportunityId = opportunity.Id,
                Quotation_Name__c = 'Destination name',
                TravelStartDate__c = Date.today(),
                TravelEndDate__c = Date.today().addDays(5)
            );
            insert quote;

            Passenger__c adultPassenger = new Passenger__c(
                FirstName__c = 'Adult',
                Last_Name__c = 'Passenger',
                PassengerType__c = 'Adult',
                Confirmed__c = true
            );

            Passenger__c childPassenger = new Passenger__c(
                FirstName__c = 'Child',
                Last_Name__c = 'Passenger',
                PassengerType__c = 'Child',
                Confirmed__c = true
            );

            insert new List<Passenger__c>{ adultPassenger, childPassenger };

            PassengerQuotationMapping__c adultMapping = new PassengerQuotationMapping__c(
                Passenger__c = adultPassenger.Id,
                Quote__c = quote.Id
            );

            PassengerQuotationMapping__c childMapping = new PassengerQuotationMapping__c(
                Passenger__c = childPassenger.Id,
                Quote__c = quote.Id
            );

            insert new List<PassengerQuotationMapping__c>{ adultMapping, childMapping };
        }
    }

    @isTest
    static void testGetTravelInformation() {
        Quote quote = [SELECT Id FROM Quote WHERE Name = 'Test Quote' LIMIT 1];

        GetTravelInformationFromQuote.QuoteRequest request = new GetTravelInformationFromQuote.QuoteRequest();
        request.quoteId = quote.Id;

        Test.startTest();
        List<GetTravelInformationFromQuote.TravelInformationResponse> responseLst = GetTravelInformationFromQuote.getTravelInformation(new List<GetTravelInformationFromQuote.QuoteRequest>{ request });
        Test.stopTest();

        System.assertEquals(1, responseLst.size(), 'Should return one response');
        GetTravelInformationFromQuote.TravelInformationResponse response = responseLst[0];

        System.assertEquals(Date.today(), response.startDate);
        System.assertEquals(2, response.totalPassengers);
        System.assertEquals(1, response.numberOfAdults);
        System.assertEquals(1, response.numberOfChildren);
        System.assertEquals('South Africa', response.countryOfInterest);
        System.assertEquals('Kruger Safaris', response.regionOfInterest);
        System.assertEquals('Go on Safari', response.activitiesOfInterest);
        System.assertEquals('Luxury', response.levelOfAccommodation);

    }
}