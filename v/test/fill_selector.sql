#
#The login Query that allows users to login to get the user's roles
select 
    `role`.id
from subscription
    inner join user ON subscription.user= user.user 
    inner join player ON subscription.player= player.player 
    inner join application ON player.application=application.application 
    inner join role on player.role = role.role 
where `user`.`email`='camilus@gmail.com'
and `application`.`id`='rentize';

#
#Query that retrieves the user roles and the business names from the query
select 
    `role`.id,
    JSON_ARRAYAGG(`business`.`name`)
from subscription
    inner join user ON subscription.user= user.user
    inner join player ON subscription.player= player.player
    inner join application ON player.application=application.application
    inner join `role` on player.role = role.role
    inner join member on member.user = user.user
    inner join business on member.business = business.business
where `user`.email= 'camilus@gmail.com'
	and application.id in ('chama')
group by id;


#
# Query that fills the selector with the member roles and the business in which
# he belongs to.
select 
    `user`.`email`,
    JSON_ARRAYAGG(business .name) as organization
from `member`
	inner join `user` on `user`.`user`=`member`.`user`
	inner join `business` on `business`.`business`= `member`.`business`
where `user`.`email` ='camilus@gmail.com'
group by `user`.`email`;
