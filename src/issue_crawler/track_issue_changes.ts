
    // const existingIssues = await client.mget<KibanaIssue>({
		// 	body: {
		// 		docs: [
		// 			...flattened.map(issue => ({
		// 				_index: indexName,
    //         _id: issue.id
		// 			}))
		// 		]
		// 	}
		// });

		// if (existingIssues.docs) {
		// 	existingIssues.docs.forEach(doc => {
		// 		if (doc.found) {
		// 			const matchingIssue = flattened.find(i => (i.id + '') === (doc._id + ''));
		// 			if (!matchingIssue) {
		// 				console.log('no match found for doc with id ' + doc._id + ' in flattened list: ', flattened.map(i => i.id));
		// 				return;
		// 			}

		// 			// The release target has gotten bumped
		// 			if (doc._source.original_release_target !== matchingIssue.release_target) {
		// 				matchingIssue.original_release_target = doc._source.original_release_target;
		// 				matchingIssue.previous_release_target = doc._source.previous_release_target ? doc._source.previous_release_target : doc._source.original_release_target;
		// 			}
	  // 		} else {
		//   		console.log('doc for ' + doc._id  + ' not found');
		// 	  }
  	// 	});
		// } else {
		// 	console.log('existingIssues is ', existingIssues);
		// }
