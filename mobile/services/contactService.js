// API antiga (funções soltas): no SDK 57 ela saiu da entrada principal do pacote e
// continua disponível em expo-contacts/legacy.
import * as Contacts from 'expo-contacts/legacy'

export async function getPhoneContacts(){

const {status}=
await Contacts.requestPermissionsAsync()

if(status!=="granted"){
return []
}

const {data}=await Contacts.getContactsAsync({

fields:[
Contacts.Fields.PhoneNumbers
]

})

return data

}